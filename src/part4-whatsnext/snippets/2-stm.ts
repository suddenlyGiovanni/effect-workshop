import { Console, Effect, STM, TRef, pipe } from "effect";

/**
 * Many times we want to share state between different parts of our application.
 * and its crucial that updates to this state are *atomic* and *consistent*.
 *
 * The *STM module* provides a way to do this.
 * It is a port of the Haskell STM and features an api that is very similar to the one you're used to in effect.
 *
 * Instead of a `Effect<A, E, R>` to represent a program with side effects,
 * we have a `STM<A, E, R>` to represent a transaction.
 * No side effects are allowed in a transaction, only pure computations and updates to state.
 *
 *
 * Just like how creating an effect does not run it, creating a transaction does not run it.
 * Only when we `commit` the transaction, it runs.
 * If any of the computations in the transaction fail, the transaction is rolled back and retried.
 *
 * Think of STM like a completely separate world from the rest of your program.
 * When you commit a transaction, even if it is made up of many different computations,
 * to the rest of your program, it looks like a single atomic operation.
 *
 * You can think of this like how the function passed to `Effect.sync` gets run.
 * It is guaranteed to run until it completes or fails, in one single synchronous step.
 * STM is like writing in the effect style, with tracked errors and dependencies but with this same guarantee.
 * But now with the additional guarantee that if there is a failure, the whole transaction is rolled back.
 *
 * Technically 'rolled back' is not the right term, because the transaction is not actually run until it is committed,
 * so it's more like all the queued up operations are just thrown away.
 *
 *
 * STM doesn't work on any state, but effect provides `T_` variants of many of effect's data types:
 * The core of these is `TRef` which is a transactional reference to a value.
 *
 * just like how get/set/update operations on a Ref return an Effect
 * the same operations on a TRef return an STM
 */

const program = Effect.gen(function* () {
  const ref: TRef.TRef<number> = yield* TRef.make(0);

  const transaction: STM.STM<void, never, never> = pipe(
    TRef.get(ref),
    STM.flatMap((i) => TRef.set(ref, i + 1))
  );

  const value: number = yield* STM.commit(TRef.get(ref)); // Commits this transaction atomically.
  console.log(value); // 0

  yield* STM.commit(transaction); // Commits this transaction atomically.
  const value2: number = yield* STM.commit(TRef.get(ref));
  console.log(value2); // 1
});

/**
 * Also, the `commit` is actually optional.
 * STMs are a subtype of Effect and commit is basically used internally if you omit it
 *
 * ---
 *
 * Let's take a look at a more complex example
 *
 * First out data model, an account with a balance that is stored in a TRef
 */

interface Account {
  id: number;
  balance: TRef.TRef<number>;
}

class InsufficientFundsError {
  readonly _tag = "InsufficientFundsError";
}

const createAccount = (id: number, initialBalance: number): STM.STM<Account> =>
  TRef.make(initialBalance).pipe(STM.map((balance) => ({ id, balance })));

const transfer = (
  from: Account,
  to: Account,
  amount: number
): STM.STM<void, InsufficientFundsError> =>
  STM.gen(function* () {
    const fromBalance: number = yield* TRef.get(from.balance);
    const toBalance: number = yield* TRef.get(to.balance);

    if (fromBalance < amount) {
      yield* STM.fail(new InsufficientFundsError());
    }

    /**
     * From a domain perspective, changing the balance of the accounts (from and to) should be an atomic and consistent Transaction.
     * if one of the two operations fails, both should fail and the state should be rolled back.
     */
    yield* TRef.set(from.balance, fromBalance - amount);
    yield* TRef.set(to.balance, toBalance + amount);
  });

const main = Effect.gen(function* () {
  const account1 = yield* createAccount(1, 1000);
  const account2 = yield* createAccount(2, 500);
  const account3 = yield* createAccount(3, 200);

  /**
   * Concurrent transfers
   */
  const transfer1: Effect.Effect<void, InsufficientFundsError, never> =
    STM.commit(transfer(account1, account2, 200));

  const transfer2: Effect.Effect<void, InsufficientFundsError, never> =
    STM.commit(transfer(account2, account1, 300));

  /**
   * Execute transfers concurrently
   */
  yield* Effect.all([transfer1, transfer2], { concurrency: "unbounded" });

  /**
   * Check final balances
   */
  const finalBalance1: number = yield* STM.commit(TRef.get(account1.balance));
  const finalBalance2: number = yield* STM.commit(TRef.get(account2.balance));

  yield* Effect.log(`Final Balance Account 1: ${finalBalance1}`);
  yield* Effect.log(`Final Balance Account 2: ${finalBalance2}`);

  const badTransaction = STM.all([
    transfer(account1, account2, 1000), // this also won't go through because the next one fails
    transfer(account3, account1, 300),
    transfer(account1, account3, 400), // this won't go through because the first one will fail
  ]);

  yield* pipe(
    STM.commit(badTransaction),
    Effect.catchAll((error) => Console.error(error._tag))
  );

  const finalBalance3: number = yield* STM.commit(TRef.get(account3.balance));
  yield* Effect.log(`Final Balance Account 3: ${finalBalance3}`); // this is the original amount
});

// Effect.runPromise(main);

/**
 * STM transactions Shouldn't be very big:
 * They should only be as large as you need them to be to ensure atomicity and consistency.
 *
 * Like this example, the 'badTransaction' should really be separate transactions
 * because they are not related to each other, so there's no reason to make them atomic together.
 *
 * ---
 *
 * An example where multiple transactions are related is maybe we have an account
 * with a minimum balance and some unknown transactions.
 * We want to apply the process, but at no point can the account go under the minimum balance.
 */

const example = Effect.gen(function* () {
  const account1 = yield* createAccount(1, 1000);
  const account2 = yield* createAccount(2, 500);
  const account3 = yield* createAccount(3, 200);

  const transfers = STM.all([
    transfer(account1, account2, 1000),
    transfer(account2, account3, 500),
    transfer(account3, account1, 400),
  ]);

  // we want to ensure that account1 never goes under 700

  const ensuringMinimumBalance = STM.gen(function* () {
    yield* transfers; // run the transfers
    const balance = yield* TRef.get(account1.balance);
    if (balance < 700) {
      return yield* STM.fail(new InsufficientFundsError());
    }
  });

  yield* pipe(
    STM.commit(ensuringMinimumBalance),
    Effect.catchAll((error) => Console.error(error._tag))
  );
});

// Effect.runPromise(example); // all transactions roll back because our final check fails

/**
 * Q: What guarantees does STM give us?
 *
 * 1. Atomicity: Each transfer operation is atomic.
 * 		If any part of the transfer fails (e.g., due to insufficient funds),
 * 		the whole transaction is rolled back, ensuring account balances are never
 * 		left in an inconsistent state.
 * 2. Consistency:
 * 		The STM ensures the consistency of the bank system by making sure all
 * 		operations either complete fully or have no effect, maintaining the
 * 		invariant that the total amount of money in the system remains constant.
 * 3. Isolation: Each transfer operation is isolated from others.
 * 		Intermediate states during a transfer are not visible to other
 * 		transactions, preventing any inconsistent reads.
 *
 * STM is a powerful tool for managing shared state in a concurrent environment.
 * It enabled these benefits without locks, and is a powerful tool for managing
 * shared state in a concurrent environment.
 * Because js is single threaded, we can be 100% sure when we commit a
 * transaction, it will run to completion without any other transactions running
 * in between.
 *
 * One final note about immutability and STM.
 * Immutability is what enables STM to work, because it rolls back to a previous state
 * because it can be sure that those previous states have not been modified
 */

const mutabilityBad = Effect.gen(function* () {
  const ref: TRef.TRef<Date> = yield* TRef.make(new Date());

  const transaction = pipe(
    // DONT DO THIS !!!
    TRef.update(ref, (date) => {
      date.setMonth(date.getMonth() + 1);
      return date;
    }),
    STM.zipRight(STM.fail(new Error("Boom!")))
  );

  const before: Date = yield* STM.commit(TRef.get(ref));
  yield* pipe(
    STM.commit(transaction),
    Effect.catchAll((error) => Console.error(error.message))
  );
  const after: Date = yield* STM.commit(TRef.get(ref));

  console.log(before.toUTCString(), after.toUTCString());
});

Effect.runPromise(mutabilityBad);

/**
 * This is a contrived example, but it shows that if you have a mutable reference,
 * you basically lose all the guarantees of STM, so be careful with your data model.
 */
