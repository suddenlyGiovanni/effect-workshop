import assert from "node:assert";
import { Brand, Data, Effect, Equal, Hash, HashSet, Schema } from "effect";

/**
 * # Exercise 1:
 *
 * Implement `equals` and `hash` for the Transaction class
 */

// @ts-expect-error: incorrectly implements interface `Equal` | `Hash`
class Transaction implements Equal.Equal, Hash.Hash {
  public readonly id: string;
  public readonly time: Date;
  public readonly amount: number;

  constructor(id: string, amount: number, time: Date) {
    this.id = id;
    this.time = time;
    this.amount = amount;
  }
}

assert(
  Equal.equals(
    new Transaction("1", 1, new Date(3)),
    new Transaction("1", 1, new Date(3))
  )
);

assert(
  Hash.hash(new Transaction("1", 1, new Date(3))) ===
    Hash.hash(new Transaction("1", 1, new Date(3)))
);

/**
 * # Exercise 2:
 *
 * Create a datatype for a string that has been guaranteed to be only ascii
 * Here is a regex for you to use : /^[\x00-\x7F]*$/
 */

type ASCIIString = never;

function takesOnlyAscii(s: ASCIIString) {
  // ...
}

// @ts-expect-error: should not compile fix it
const string1: ASCIIString = "hello";
// @ts-expect-error: should not compile. fix it
const string2: ASCIIString = "hello🌍";

takesOnlyAscii(string1);
takesOnlyAscii(string2);
