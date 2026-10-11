import { describe, expect, it } from "vitest";
import { parseSshAuthMethods } from ".";

describe("parseSshAuthMethods", () => {
  it("reads the methods the server still offers", () => {
    expect(parseSshAuthMethods("facini@10.0.5.18: Permission denied (publickey,password).\n")).toEqual(["publickey", "password"]);
    expect(parseSshAuthMethods("Warning: x\nfacini@spark: Permission denied (publickey).")).toEqual(["publickey"]);
  });
  it("returns null when ssh never got to authentication", () => {
    expect(parseSshAuthMethods("ssh: connect to host 10.0.5.18 port 22: Connection timed out")).toBeNull();
    expect(parseSshAuthMethods("")).toBeNull();
  });
});
