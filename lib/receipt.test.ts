import assert from "node:assert/strict";
import test from "node:test";
import { decodeReturnedId } from "./receipt.ts";

test("decodes finalized readable ID", () => assert.equal(decodeReturnedId({ result: { readable: "3" } }), "3"));
test("decodes hexadecimal ID", () => assert.equal(decodeReturnedId({ returnValue: "0x0a" }), "10"));
test("does not default to zero", () => assert.throws(() => decodeReturnedId({ status: "FINALIZED" }), /FINALIZED_RETURN_ID_NOT_FOUND/));
test("prefers leader return payload over outer transaction result enum", () => assert.equal(decodeReturnedId({
  result: 6,
  consensus_data: { leader_receipt: [{ execution_result: "SUCCESS", result: { status: "return", payload: { readable: '"0"' } } }] },
}), "0"));
