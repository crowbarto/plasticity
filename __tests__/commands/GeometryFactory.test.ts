import { GeometryFactory } from "../../src/commands/Factory";
import { EditorSignals } from '../../src/Editor';
import { GeometryDatabase } from '../../src/GeometryDatabase';
import MaterialDatabase from '../../src/MaterialDatabase';
import * as visual from '../../src/VisualModel';
import { FakeMaterials } from "../../__mocks__/FakeMaterials";
import FakeSignals from '../../__mocks__/FakeSignals';
import '../matchers';

class FakeFactory extends GeometryFactory {
    updateCount = 0;
    promises: Promise<void>[] = [];

    get keys() { return ['revertOnError'] }

    revertOnError = 0;

    protected async doUpdate() {
        return this.promises[this.updateCount++];
    }

    protected async doCommit(): Promise<visual.SpaceItem | visual.SpaceItem[]> {
        throw new Error("Method not implemented.");
    }
    protected doCancel(): void {
        throw new Error("Method not implemented.");
    }
}

let db: GeometryDatabase;
let factory: FakeFactory;
let materials: Required<MaterialDatabase>;
let signals: EditorSignals;

beforeEach(() => {
    materials = new FakeMaterials();
    signals = FakeSignals();
    db = new GeometryDatabase(materials, signals);
    factory = new FakeFactory(db, materials, signals);
})

describe('update', () => {
    test('simple update', async () => {
        factory.promises.push(Promise.resolve());
        await factory.update();
        expect(factory.updateCount).toBe(1);
    })


    test('does not enqueue multiple updates', async () => {
        let resolve1, resolve2;
        factory.promises.push(new Promise<void>((resolve, _) => { resolve1 = resolve }));
        factory.promises.push(new Promise<void>((resolve, _) => { resolve2 = resolve }));

        const first = factory.update();
        factory.update();
        factory.update();
        factory.update();
        factory.update();
        factory.update();
        factory.update();
        resolve1(); resolve2();
        await first;
        expect(factory.updateCount).toBe(2);
    });

    test("it keeps going if there's an exception", async () => {
        let reject1, resolve2;
        factory.promises.push(new Promise<void>((_, reject) => { reject1 = reject }));
        factory.promises.push(new Promise<void>((resolve, _) => { resolve2 = resolve }));

        const first = factory.update();
        factory.update();
        reject1("error"); resolve2();
        await first;
        expect(factory.updateCount).toBe(2);
    });

    test("works serially", async () => {
        let resolve;
        factory.promises.push(new Promise<void>((resolve_, _) => { resolve = resolve_ }));
        const first = factory.update();
        resolve();
        await first;

        factory.promises.push(new Promise<void>((resolve_, _) => { resolve = resolve_ }));
        const second = factory.update();
        resolve();
        await second;

        expect(factory.updateCount).toBe(2);
    });

    test("in case of error, it reverts to last successful parameter", async () => {
        let resolve1, reject2;
        factory.revertOnError = 1;
        factory.promises.push(new Promise<void>((resolve_, _) => { resolve1 = resolve_ }));
        const first = factory.update();
        resolve1();
        await first;

        factory.revertOnError = 2;
        factory.promises.push(new Promise<void>((_, reject_) => { reject2 = reject_ }));
        const second = factory.update();
        reject2("error");
        await second;

        expect(factory.revertOnError).toBe(1);
        expect(factory.updateCount).toBe(3);
    });
})