import { CompositeDisposable, Disposable } from "event-kit";
import * as THREE from "three";
import { EditorSignals } from "../../../editor/EditorSignals";
import { DatabaseLike } from "../../../editor/GeometryDatabase";
import * as intersectable from "../../../editor/Intersectable";
import * as visual from "../../../editor/VisualModel";
import { GPUPicker } from "./GPUPicking";

export interface GPUPickingAdapter<T> {
    setFromCamera(screenPoint: THREE.Vector2, camera: THREE.Camera): void;
    intersect(): T[];
}

class GeometryIdEncoder {
    readonly parentIdMask: number = 0xffff000;

    encode(type: 'edge' | 'face', parentId: number, index: number): number {
        if (parentId > (1 << 16)) throw new Error("precondition failure");
        if (index > (1 << 15)) throw new Error("precondition failure");

        parentId <<= 16;
        const c = (type === 'edge' ? 0 : 1) << 7;
        const d = c | ((index >> 8) & 0xef);
        const e = ((index >> 0) & 255);

        const id = parentId | (d << 8) | e;
        return id;
    }

    decode(compact: number) {
        const parentId = compact >> 16;
        compact &= 0xffff;
        const type = compact >> 15;
        compact &= 0x7fff;
        const index = compact;
        return { parentId, type, index };
    }
}

// Encoding a 32 bit id into RGBA might be transparent; turn on alpha some alpha bits at the
// expense of losing some id space.
class DebugGeometryIdEncoder extends GeometryIdEncoder {
    readonly parentIdMask = 0x0fff000;

    encode(type: 'edge' | 'face', parentId: number, index: number): number {
        return super.encode(type, parentId, index) | 0xf0000000;
    }

    decode(compact: number) {
        return super.decode(compact & 0x0fffffff);
    }
}

export class GeometryGPUPickingAdapter implements GPUPickingAdapter<intersectable.Intersectable> {
    private readonly disposable = new CompositeDisposable();
    dispose() { this.disposable.dispose(); }

    static encoder = process.env.NODE_ENV == 'development' ? new DebugGeometryIdEncoder() : new GeometryIdEncoder();

    constructor(private readonly picker: GPUPicker, private readonly db: DatabaseLike, signals: EditorSignals) {
        this.update = this.update.bind(this);
        signals.sceneGraphChanged.add(this.update);
        signals.historyChanged.add(this.update);
        signals.commandEnded.add(this.update);
        this.disposable.add(new Disposable(() => {
            signals.sceneGraphChanged.remove(this.update);
            signals.historyChanged.remove(this.update);
            signals.commandEnded.remove(this.update);
        }));
        this.update();
    }

    setFromCamera(normalizedScreenPoint: THREE.Vector2, camera: THREE.Camera) {
        this.picker.setFromCamera(normalizedScreenPoint, camera);
    }

    intersect() {
        const intersection = this.picker.intersect();
        if (intersection === undefined)
            return [];
        else
            return [GeometryGPUPickingAdapter.get(intersection.id, this.db)];
    }

    static get(id: number, db: DatabaseLike): intersectable.Intersectable {
        const { parentId } = GeometryGPUPickingAdapter.encoder.decode(id);
        const item = db.lookupItemById(parentId).view;
        if (item instanceof visual.Solid) {
            const simpleName = GeometryGPUPickingAdapter.compact2full(id);
            const data = db.lookupTopologyItemById(simpleName);
            return [...data.views][0];
        } else if (item instanceof visual.SpaceInstance) {
            return item.underlying;
        } else if (item instanceof visual.PlaneInstance) {
            return item.underlying;
        } else {
            throw new Error("invalid item");
        }
    }

    update() {
        console.log("geometry update")
        this.picker.update(this.db.visibleObjects.map(o => o.picker));
    }

    static compact2full(compact: number): string {
        const { parentId, type, index } = GeometryGPUPickingAdapter.encoder.decode(compact);
        return type === 0 ? visual.CurveEdge.simpleName(parentId, index) : visual.Face.simpleName(parentId, index);
    }
}