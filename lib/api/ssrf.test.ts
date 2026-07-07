import { describe, it, expect } from "vitest";
import { isPrivateAddress, validateExtractUrl } from "./ssrf";

describe("isPrivateAddress", () => {
  it("flags loopback", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("127.255.255.255")).toBe(true);
  });

  it("flags RFC1918 private ranges", () => {
    expect(isPrivateAddress("10.0.0.1")).toBe(true);
    expect(isPrivateAddress("172.16.0.1")).toBe(true);
    expect(isPrivateAddress("172.31.255.255")).toBe(true);
    expect(isPrivateAddress("192.168.1.1")).toBe(true);
  });

  it("flags link-local and metadata addresses", () => {
    expect(isPrivateAddress("169.254.169.254")).toBe(true); // cloud metadata
    expect(isPrivateAddress("0.0.0.0")).toBe(true);
  });

  it("does not flag adjacent public ranges", () => {
    expect(isPrivateAddress("172.15.255.255")).toBe(false);
    expect(isPrivateAddress("172.32.0.0")).toBe(false);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("1.1.1.1")).toBe(false);
  });

  it("flags IPv6 loopback, unique-local, and link-local", () => {
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("fc00::1")).toBe(true);
    expect(isPrivateAddress("fd12:3456::1")).toBe(true);
    expect(isPrivateAddress("fe80::1")).toBe(true);
  });

  it("flags IPv4-mapped IPv6 private addresses", () => {
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:10.0.0.1")).toBe(true);
  });

  it("does not flag a public IPv6 address", () => {
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("fails closed on garbage input", () => {
    expect(isPrivateAddress("not-an-ip")).toBe(true);
    expect(isPrivateAddress("")).toBe(true);
  });
});

describe("validateExtractUrl", () => {
  it("rejects non-https protocols", async () => {
    const result = await validateExtractUrl("http://example.com");
    expect(result.ok).toBe(false);
  });

  it("rejects malformed URLs", async () => {
    const result = await validateExtractUrl("not a url");
    expect(result.ok).toBe(false);
  });

  it("rejects a literal loopback IP", async () => {
    const result = await validateExtractUrl("https://127.0.0.1/");
    expect(result.ok).toBe(false);
  });

  it("rejects a literal private IP", async () => {
    const result = await validateExtractUrl("https://192.168.1.1/foo");
    expect(result.ok).toBe(false);
  });

  it("rejects the cloud metadata address", async () => {
    const result = await validateExtractUrl("https://169.254.169.254/latest/meta-data");
    expect(result.ok).toBe(false);
  });

  it("rejects a literal IPv6 loopback", async () => {
    const result = await validateExtractUrl("https://[::1]/");
    expect(result.ok).toBe(false);
  });
});
