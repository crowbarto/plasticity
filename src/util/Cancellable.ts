/**
 * The classes here represent promise-like object that can be cancelled or "finished" earlier than it would normally
 * terminate. For example, a promise that resolves when a user drags a gizmo from point a to b can be canceled by
 * the user hitting ESCAPE. It might be finished by hitting ENTER.
 * 
 * All cancellable objects should be "registered" meaning that if multiple cancellable promises are simultaneously
 * running, the Registor can cancel them all.
 */

import { Disposable } from "event-kit";

export interface Cancellable {
    cancel(): void;
}

export interface Finishable {
    finish(): void;
}

export abstract class ResourceRegistration implements Cancellable, Finishable {
    abstract cancel(): void;
    abstract finish(): void;

    resource(reg: CancellableRegistor): this {
        reg.resource(this);
        return this;
    }
}

export class CancellableDisposable extends ResourceRegistration {
    constructor(private readonly disposable: Disposable) {
        super();
    }

    cancel() { this.disposable.dispose() }
    finish() { this.disposable.dispose() }
}

export const Cancel = { tag: 'Cancel' };
export const Finish = { tag: 'Finish' };

type Executor<T> = (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => { cancel: (() => void), finish: (() => void) };

type State = 'None' | 'Cancelled' | 'Finished';

// An object that has a collection of cancellable resources
// This is used for Commands, which have factories, gizmos, etc. which
// can be cancelled / finished /etc.
export abstract class CancellableRegistor {
    private readonly resources: (Cancellable & Finishable)[] = [];

    cancel(): void {
        for (const resource of this.resources) {
            resource.cancel();
        }
    }

    finish(): void {
        for (const resource of this.resources) {
            resource.finish();
        }
    }

    resource<T extends ResourceRegistration>(x: T): T {
        this.resources.push(x);
        return x
    }
}

export class CancellablePromise<T> extends ResourceRegistration implements PromiseLike<T> {
    static resolve() {
        return new CancellablePromise<void>((resolve, reject) => {
            resolve();
            const cancel = () => { }
            const finish = () => { }
            return { cancel, finish };
        });
    }

    cancel!: () => void;
    finish!: () => void;
    private readonly promise: Promise<T>;

    constructor(executor: Executor<T>) {
        super();
        const that = this;
        this.promise = new Promise<T>((resolve, reject) => {
            const { cancel, finish } = executor(resolve, reject);
            that.cancel = cancel;
            that.finish = finish;
        });
    }

    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2> {
        return this.promise.then(onfulfilled, onrejected);
    }
}
