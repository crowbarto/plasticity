import { CompositeDisposable, Disposable } from 'event-kit';
import * as THREE from "three";
import { Viewport } from '../components/viewport/Viewport';
import { DatabaseLike } from "../editor/DatabaseLike";
import { EditorSignals } from '../editor/EditorSignals';
import { ConstructionPlane } from "../editor/snaps/ConstructionPlaneSnap";
import { PointSnap, Snap } from "../editor/snaps/Snap";
import { Helper, Helpers } from '../util/Helpers';
import { SnapManagerGeometryCache } from "../visual_model/SnapManagerGeometryCache";
import { GizmoSnapPicker, SnapPicker, SnapResult } from '../visual_model/SnapPicker';
import { GizmoMaterialDatabase } from './GizmoMaterials';
import { Model, pointGeometry } from './PointPicker';
import { SnapIndicator } from './SnapIndicator';

export interface SnapInfo {
    snap: Snap,
    constructionPlane: ConstructionPlane,
    orientation: THREE.Quaternion
    position: THREE.Vector3;
    cursorPosition: THREE.Vector3;
    cursorOrientation: THREE.Quaternion;
    cameraPosition: THREE.Vector3;
    cameraOrientation: THREE.Quaternion;
}

// This is a presentation or template class that contains all info needed to show "nearby" and "snap" points to the user
// There are icons, indicators, textual name explanations, etc.

export class SnapPresentation {
    static makeForPointPicker(picker: SnapPicker, viewport: Viewport, pointPicker: Model, db: DatabaseLike, snapCache: SnapManagerGeometryCache, gizmos: GizmoMaterialDatabase) {
        const { constructionPlane, isOrthoMode } = viewport;

        const nearby = picker.nearby(pointPicker, snapCache, db);
        const intersections = picker.intersect(pointPicker, snapCache, db);
        const actualConstructionPlaneGiven = pointPicker.actualConstructionPlaneGiven(constructionPlane, isOrthoMode);
        const indicator = new SnapIndicator(gizmos);
        const activatedHelpers = [...pointPicker.activatedHelpers].map(s => s.helper!).filter(h => h !== undefined);

        const presentation = new SnapPresentation(nearby, intersections, actualConstructionPlaneGiven, viewport.camera, indicator, activatedHelpers);
        return { presentation, intersections, nearby };
    }

    static makeForGizmo(picker: GizmoSnapPicker, viewport: Viewport, db: DatabaseLike, snapCache: SnapManagerGeometryCache, gizmos: GizmoMaterialDatabase) {
        const { constructionPlane } = viewport;

        const nearby = picker.nearby(snapCache, db);
        const intersections = picker.intersect(snapCache, db);
        const indicators = new SnapIndicator(gizmos);

        const presentation = new SnapPresentation(nearby, intersections, constructionPlane, viewport.camera, indicators, []);
        return { presentation, intersections, nearby };
    }

    readonly helpers: THREE.Object3D[];
    readonly info?: SnapInfo;
    readonly names: readonly string[];
    readonly nearby: Helper[];

    constructor(nearby: PointSnap[], intersections: SnapResult[], constructionPlane: ConstructionPlane, camera: THREE.Camera, presenter: SnapIndicator, activatedHelpers: THREE.Object3D[]) {
        this.nearby = nearby.map(n => presenter.nearbyIndicatorFor(n));

        if (intersections.length === 0) {
            this.names = [];
            this.helpers = [];
            return;
        }

        // First match is assumed best
        const first = intersections[0];
        this.info = { ...first, constructionPlane, cameraOrientation: camera.quaternion.clone(), cameraPosition: camera.position.clone() };

        const indicator = presenter.snapIndicatorFor(first);

        // Collect indicators, etc. as feedback for the user
        const helpers = activatedHelpers;
        helpers.push(indicator);

        // And add additional helpers associated with all matching snaps; include names too
        let names = [];
        for (const intersection of intersections) {
            const { helper, name } = intersection.snap;
            if (helper !== undefined) helpers.push(helper);
            if (name !== undefined) names.push(name);
        }
        this.helpers = helpers;

        // Collect names of other matches to display to user
        this.names = [...new Set(names)].sort();
    }
}

export class PointTarget extends Helper {
    private readonly mesh = new THREE.Mesh(pointGeometry, new THREE.MeshStandardMaterial());

    constructor() {
        super();
        this.add(this.mesh);
    }
}

interface EditorLike {
    helpers: Helpers;
    signals: EditorSignals;
    viewports: Viewport[];
}

export class SnapPresenter {
    private readonly cursorHelper = new PointTarget();
    private readonly helpers = new THREE.Scene();

    constructor(private readonly editor: EditorLike) { }

    execute() {
        const { editor, cursorHelper, helpers } = this;
        const disposables = new CompositeDisposable();
        this.cursorHelper.visible = false;
        this.editor.helpers.add(this.cursorHelper);
        disposables.add(new Disposable(() => editor.helpers.remove(cursorHelper)));
        disposables.add(new Disposable(() => editor.signals.snapped.dispatch(undefined)));

        for (const viewport of editor.viewports) {
            viewport.additionalHelpers.add(helpers);
            disposables.add(new Disposable(() => viewport.additionalHelpers.delete(helpers)));
        }
        return disposables;
    }

    onPointerMove(viewport: Viewport, presentation: SnapPresentation) {
        const { editor, cursorHelper, helpers } = this;

        helpers.clear();
        const { names, helpers: newHelpers, nearby: indicators } = presentation;
        for (const i of indicators) helpers.add(i);

        const info = presentation.info;
        if (info === undefined) {
            cursorHelper.visible = false;
            editor.signals.pointPickerChanged.dispatch();
            return;
        }
        cursorHelper.visible = true;
        const { position, cursorPosition } = info;

        if (newHelpers.length > 0) helpers.add(...newHelpers);
        cursorHelper.position.copy(cursorPosition);

        editor.signals.snapped.dispatch(
            names.length > 0 ?
                { position: position.clone().project(viewport.camera), names }
                : undefined);
    }

    clear() {
        const { editor, cursorHelper, helpers } = this;
        helpers.clear();
        cursorHelper.visible = false;
        editor.signals.pointPickerChanged.dispatch();
    }
}
