import { TestBed } from '@angular/core/testing';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { Observable, of, throwError } from 'rxjs';

import type { ApiError } from '../../../core/errors/api-error';
import { serverConfirmedMove } from './server-confirmed-move';

/**
 * `serverConfirmedMove` is the **non-negotiable enforcement** for the
 * no-optimistic-mutations contract. These tests prove four things:
 *
 * 1. `onSuccess` fires AFTER the HTTP response (server is the source of truth).
 * 2. `onError` fires with a normalized `ApiError` on HTTP error.
 * 3. NO local-state write happens before success.
 * 4. The `applyLocal?: never` type guard is enforced at compile time.
 */
describe('serverConfirmedMove', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
  });

  /**
   * Build a synthetic `CdkDragDrop` event. CDK's `CdkDragDrop<T>` is a
   * structural interface; only the fields the handler forwards need to be
   * populated.
   */
  function dropEvent(): CdkDragDrop<unknown, unknown, any> {
    return {
      previousIndex: 0,
      currentIndex: 2,
      item: {} as never,
      container: {} as never,
      previousContainer: {} as never,
      isPointerOverContainer: true,
      distance: { x: 0, y: 0 },
      dropPoint: { x: 0, y: 0 },
      event: new MouseEvent('mouseup'),
    };
  }

  it('fires onSuccess ONLY after the HTTP response lands', () => {
    let moveReturned = false;
    let successFired = false;
    const writeSpy = vi.fn();

    const handler = serverConfirmedMove<{ id: number; position: string }>({
      move: () => {
        // Simulate async HTTP that completes on a microtask.
        return of({ id: 87, position: 'n' }).pipe(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (s) =>
            new Observable<{ id: number; position: string }>((sub) => {
              const sub_ = s.subscribe({
                next: (v) => {
                  moveReturned = true;
                  // At this point the user MUST NOT see any local mutation
                  // — assert the spy has not been called yet.
                  expect(writeSpy).not.toHaveBeenCalled();
                  sub.next(v);
                  sub.complete();
                },
              });
              return () => sub_.unsubscribe();
            }),
        );
      },
      onSuccess: (response) => {
        successFired = true;
        // The order is contractual: HTTP next fires BEFORE onSuccess.
        expect(moveReturned).toBe(true);
        writeSpy(response);
      },
      onError: () => {
        throw new Error('onError should not fire on success');
      },
    });

    handler(dropEvent());

    expect(successFired).toBe(true);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith({ id: 87, position: 'n' });
  });

  it('routes HTTP errors to onError with a normalized ApiError', () => {
    const onSuccessSpy = vi.fn();
    const onErrorSpy = vi.fn();

    const apiError: ApiError = {
      kind: 'validation',
      status: 422,
      message: 'Position exhausted.',
      fieldErrors: {},
      code: 'position_exhausted',
    };

    const handler = serverConfirmedMove<unknown>({
      move: () => throwError(() => apiError),
      onSuccess: onSuccessSpy,
      onError: onErrorSpy,
    });

    handler(dropEvent());

    expect(onSuccessSpy).not.toHaveBeenCalled();
    expect(onErrorSpy).toHaveBeenCalledTimes(1);
    expect(onErrorSpy).toHaveBeenCalledWith(apiError, expect.anything());
  });

  it('does NOT write local state before the HTTP response', async () => {
    // This is the contract: NO optimistic mutation. We assert it by holding
    // the move() Observable open and checking that no callback fires until
    // the Observable emits.
    let localWriteHappened = false;
    let moveCompleted = false;
    let onSuccessFiredBeforeMove = false;

    const handler = serverConfirmedMove<{ id: number }>({
      move: () =>
        new Observable<{ id: number }>((sub) => {
          // Emit on the next microtask — plenty of time for a wrong impl
          // to call onSuccess early.
          queueMicrotask(() => {
            moveCompleted = true;
            sub.next({ id: 87 });
            sub.complete();
          });
          return () => undefined;
        }),
      onSuccess: () => {
        if (!moveCompleted) {
          onSuccessFiredBeforeMove = true;
        }
        localWriteHappened = true;
      },
      onError: () => {
        throw new Error('onError should not fire');
      },
    });

    handler(dropEvent());
    // Drain microtasks so the queueMicrotask inside move() fires.
    await Promise.resolve();
    await Promise.resolve();

    expect(onSuccessFiredBeforeMove).toBe(false);
    expect(localWriteHappened).toBe(true);
  });

  it('compile-time guard: applyLocal cannot be assigned (// @ts-expect-error)', () => {
    // This test is INTENTIONALLY a no-op at runtime. Its purpose is to make
    // the build fail if `applyLocal` ever becomes assignable. The
    // `// @ts-expect-error` directive must remain balanced: removing it
    // should cause a TypeScript error, and assigning to `applyLocal` should
    // produce a second error that the directive consumes.
    //
    // The directive is placed directly above the assignment so TypeScript
    // consumes exactly the expected error (TS2322: `() => undefined` is not
    // assignable to `undefined`).
    void (() => {
      const opts: Parameters<typeof serverConfirmedMove>[0] = {
        move: () => of({}),
        onSuccess: () => undefined,
        onError: () => undefined,
        // @ts-expect-error — `applyLocal` is typed `never`; assigning a function must fail TS2322.
        applyLocal: () => undefined,
      };
      // Touch the variable so the assignment survives dead-code elimination.
      void opts;
    })();

    // If the @ts-expect-error is ever unbalanced (either removed or no longer
    // needed), this runtime assertion documents the intent.
    expect(true).toBe(true);
  });

  it('defensive: if move() returns a non-Observable, onError fires with a network error', () => {
    const onSuccessSpy = vi.fn();
    const onErrorSpy = vi.fn();

    const handler = serverConfirmedMove<unknown>({
      // Intentional type-bypass via `as never` for the runtime check.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      move: (() => null) as any,
      onSuccess: onSuccessSpy,
      onError: onErrorSpy,
    });

    handler(dropEvent());

    expect(onSuccessSpy).not.toHaveBeenCalled();
    expect(onErrorSpy).toHaveBeenCalledTimes(1);
    expect(onErrorSpy.mock.calls[0]?.[0]).toMatchObject({
      kind: 'network',
      status: 0,
    });
  });
});