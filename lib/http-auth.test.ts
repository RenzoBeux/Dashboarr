import {
  basicAuthHeader,
  buildDigestAuthorization,
  listAuthSchemes,
  parseAuthChallenges,
  parseDigestChallenge,
} from "@/lib/http-auth";

// Pull a single parameter back out of a built Authorization header.
function param(header: string, name: string): string | undefined {
  const match = header.match(new RegExp(`(?:^|[ ,])${name}=("([^"]*)"|[^,]*)`));
  return match ? (match[2] ?? match[1]) : undefined;
}

describe("basicAuthHeader", () => {
  it("encodes a full credential pair", () => {
    expect(basicAuthHeader("u", "p")).toBe(`Basic ${btoa("u:p")}`);
  });

  it("treats an absent username as empty rather than the text 'undefined'", () => {
    // updateInstanceSecrets deletes an empty field from SecureStore, so a
    // token-in-password instance reloads with username === undefined. An
    // inline template literal would send `Basic ` + btoa("undefined:token").
    expect(basicAuthHeader(undefined, "token")).toBe(`Basic ${btoa(":token")}`);
    expect(basicAuthHeader("", "token")).toBe(`Basic ${btoa(":token")}`);
  });

  it("still sends with only a username set", () => {
    expect(basicAuthHeader("u", undefined)).toBe(`Basic ${btoa("u:")}`);
  });

  it("sends nothing when there are no credentials", () => {
    expect(basicAuthHeader(undefined, undefined)).toBeUndefined();
    expect(basicAuthHeader("", "")).toBeUndefined();
  });
});

describe("parseAuthChallenges", () => {
  it("keeps commas that live inside a quoted realm", () => {
    expect(
      parseAuthChallenges('Digest realm="rTorrent, private", qop="auth"'),
    ).toEqual([
      { scheme: "Digest", params: { realm: "rTorrent, private", qop: "auth" } },
    ]);
  });

  it("splits two challenges sharing one header", () => {
    expect(
      parseAuthChallenges('Digest realm="a", nonce="b", Basic realm="c"'),
    ).toEqual([
      { scheme: "Digest", params: { realm: "a", nonce: "b" } },
      { scheme: "Basic", params: { realm: "c" } },
    ]);
  });

  it("tolerates whitespace around the equals sign", () => {
    expect(parseAuthChallenges('Digest charset = "UTF-8"')[0].params).toEqual({
      charset: "UTF-8",
    });
  });

  it("undoes quoted-pair escaping", () => {
    expect(parseAuthChallenges('Digest realm="a \\"b\\" c"')[0].params.realm).toBe(
      'a "b" c',
    );
  });

  it("accepts a scheme with no parameters", () => {
    expect(parseAuthChallenges("Negotiate")).toEqual([
      { scheme: "Negotiate", params: {} },
    ]);
  });

  it("keeps a token68 blob whole instead of splitting it on its padding", () => {
    // RFC 7235 token68 ends in optional `=` padding, so the auth-param regex
    // would otherwise turn `YII0BQ==` into a `yii0bq` parameter.
    expect(parseAuthChallenges("Negotiate YII0BQ==")).toEqual([
      { scheme: "Negotiate", params: {}, token68: "YII0BQ==" },
    ]);
  });
});

describe("listAuthSchemes", () => {
  it("lists recognised schemes in the order offered", () => {
    expect(listAuthSchemes('Digest realm="a", Basic realm="b"')).toEqual([
      "Digest",
      "Basic",
    ]);
  });

  it("de-duplicates repeated schemes case-insensitively", () => {
    expect(listAuthSchemes('Digest realm="a", digest realm="b"')).toEqual([
      "Digest",
    ]);
  });

  it("drops fragments produced by an unquoted comma instead of naming them", () => {
    // A hand-rolled server sending `nonce=abc,def` splits into a `def` segment
    // that looks like a scheme token. Reporting "requires Digest or def
    // authentication" would be nonsense.
    expect(listAuthSchemes("Digest realm=x, nonce=abc,def")).toEqual(["Digest"]);
  });

  it("names an unrecognised scheme that carries auth-params", () => {
    // An SSO proxy in front of the mount is exactly the case the message
    // exists for — dropping the token would leave the user blaming their
    // password (#352).
    expect(listAuthSchemes('SSO realm="authelia"')).toEqual(["SSO"]);
  });

  it("names an unrecognised scheme that carries a token68 blob", () => {
    expect(listAuthSchemes("Mutual YII0BQ==")).toEqual(["Mutual"]);
  });

  it("returns nothing for an empty header", () => {
    expect(listAuthSchemes("")).toEqual([]);
  });

  it("accepts a pre-parsed challenge list", () => {
    const parsed = parseAuthChallenges('Digest realm="a", Basic realm="b"');
    expect(listAuthSchemes(parsed)).toEqual(["Digest", "Basic"]);
  });
});

describe("parseDigestChallenge", () => {
  it("returns null when Digest is not offered", () => {
    expect(parseDigestChallenge('Basic realm="x"')).toBeNull();
  });

  it("finds Digest even when Basic is listed first", () => {
    expect(
      parseDigestChallenge('Basic realm="x", Digest realm="y", nonce="z"'),
    ).toMatchObject({ realm: "y", nonce: "z" });
  });

  it("defaults a missing algorithm to MD5 without inventing the parameter", () => {
    const challenge = parseDigestChallenge('Digest realm="a", nonce="b"');
    expect(challenge?.algorithm).toBeUndefined();
    expect(challenge?.unsupported).toBeUndefined();
  });

  it("treats a missing qop as a legacy RFC 2069 challenge", () => {
    expect(parseDigestChallenge('Digest realm="a", nonce="b"')?.qop).toBeUndefined();
  });

  it("picks auth when the server offers auth and auth-int", () => {
    expect(
      parseDigestChallenge('Digest realm="a", nonce="b", qop="auth,auth-int"')?.qop,
    ).toBe("auth");
  });

  it("reads the stale flag", () => {
    expect(
      parseDigestChallenge('Digest realm="a", nonce="b", stale=TRUE')?.stale,
    ).toBe(true);
  });

  it("rejects an auth-int-only challenge", () => {
    expect(
      parseDigestChallenge('Digest realm="a", nonce="b", qop="auth-int"')
        ?.unsupported,
    ).toMatch(/auth-int/);
  });

  it("rejects an algorithm we cannot compute", () => {
    expect(
      parseDigestChallenge('Digest realm="a", nonce="b", algorithm=SHA-512-256')
        ?.unsupported,
    ).toMatch(/SHA-512-256/);
  });

  it("rejects a challenge with no nonce", () => {
    expect(parseDigestChallenge('Digest realm="a"')?.unsupported).toMatch(
      /realm or nonce/,
    );
  });

  it("answers the strongest supported challenge when the server offers several", () => {
    // RFC 7616 section 3.7's own example: most-secure-first, and only the
    // first of the three is one we cannot compute.
    const challenge = parseDigestChallenge(
      'Digest realm="http-auth@example.org", qop="auth", algorithm=SHA-512-256, nonce="n512", opaque="o512", ' +
        'Digest realm="http-auth@example.org", qop="auth", algorithm=SHA-256, nonce="n256", opaque="o256", ' +
        'Digest realm="http-auth@example.org", qop="auth", algorithm=MD5, nonce="nmd5", opaque="omd5"',
    );
    expect(challenge?.unsupported).toBeUndefined();
    expect(challenge?.algorithm).toBe("SHA-256");
    expect(challenge?.nonce).toBe("n256");
  });

  it("reports unsupported only when no offered Digest challenge qualifies", () => {
    expect(
      parseDigestChallenge(
        'Digest realm="a", nonce="b", algorithm=SHA-512-256, ' +
          'Digest realm="a", nonce="c", algorithm=SHA-512',
      )?.unsupported,
    ).toMatch(/SHA-512-256/);
  });

  it("accepts a pre-parsed challenge list", () => {
    const parsed = parseAuthChallenges('Basic realm="x", Digest realm="y", nonce="z"');
    expect(parseDigestChallenge(parsed)).toMatchObject({ realm: "y", nonce: "z" });
  });
});

describe("buildDigestAuthorization", () => {
  // RFC 2617 section 3.5.
  it("reproduces the RFC 2617 example response", () => {
    const header = buildDigestAuthorization({
      challenge: parseDigestChallenge(
        'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"',
      )!,
      username: "Mufasa",
      password: "Circle Of Life",
      method: "GET",
      uri: "/dir/index.html",
      cnonce: "0a4f113b",
      nc: 1,
    });

    expect(param(header, "response")).toBe("6629fae49393a05397450978507c4ef1");
    expect(param(header, "nc")).toBe("00000001");
    expect(param(header, "qop")).toBe("auth");
    expect(param(header, "opaque")).toBe("5ccc069c403ebaf9f0171e9517f40e41");
  });

  // RFC 7616 section 3.9.1, the MD5 half.
  it("reproduces the RFC 7616 MD5 example response", () => {
    const header = buildDigestAuthorization({
      challenge: parseDigestChallenge(
        'Digest realm="http-auth@example.org", qop="auth, auth-int", algorithm=MD5, nonce="7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v", opaque="FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS"',
      )!,
      username: "Mufasa",
      password: "Circle of Life",
      method: "GET",
      uri: "/dir/index.html",
      cnonce: "f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ",
      nc: 1,
    });

    expect(param(header, "response")).toBe("8ca523f5e9506fed4657c9700eebdbec");
    expect(param(header, "algorithm")).toBe("MD5");
  });

  // RFC 7616 section 3.9.1, the SHA-256 half.
  it("reproduces the RFC 7616 SHA-256 example response", () => {
    const header = buildDigestAuthorization({
      challenge: parseDigestChallenge(
        'Digest realm="http-auth@example.org", qop="auth", algorithm=SHA-256, nonce="7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v", opaque="FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS"',
      )!,
      username: "Mufasa",
      password: "Circle of Life",
      method: "GET",
      uri: "/dir/index.html",
      cnonce: "f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ",
      nc: 1,
    });

    expect(param(header, "response")).toBe(
      "753927fa0e85d155564e2e272a28d1802ca10daf4496794697cf8db5856cb6c1",
    );
  });

  it("omits qop, nc and cnonce for a legacy RFC 2069 challenge", () => {
    const header = buildDigestAuthorization({
      challenge: parseDigestChallenge('Digest realm="a", nonce="b"')!,
      username: "u",
      password: "p",
      method: "POST",
      uri: "/RPC2",
      cnonce: "unused",
      nc: 1,
    });

    expect(header).not.toMatch(/qop=/);
    expect(header).not.toMatch(/cnonce=/);
    expect(header).not.toMatch(/\bnc=/);
    expect(header).not.toMatch(/algorithm=/);
    expect(param(header, "uri")).toBe("/RPC2");
  });

  it("hashes MD5-sess with the nonce and cnonce mixed in", () => {
    const sess = buildDigestAuthorization({
      challenge: parseDigestChallenge(
        'Digest realm="a", nonce="b", qop="auth", algorithm=MD5-sess',
      )!,
      username: "u",
      password: "p",
      method: "POST",
      uri: "/RPC2",
      cnonce: "c",
      nc: 1,
    });
    const plain = buildDigestAuthorization({
      challenge: parseDigestChallenge(
        'Digest realm="a", nonce="b", qop="auth", algorithm=MD5',
      )!,
      username: "u",
      password: "p",
      method: "POST",
      uri: "/RPC2",
      cnonce: "c",
      nc: 1,
    });

    expect(param(sess, "response")).not.toBe(param(plain, "response"));
    expect(param(sess, "algorithm")).toBe("MD5-sess");
  });

  it("formats the nonce count as eight hex digits", () => {
    const header = buildDigestAuthorization({
      challenge: parseDigestChallenge('Digest realm="a", nonce="b", qop="auth"')!,
      username: "u",
      password: "p",
      method: "POST",
      uri: "/RPC2",
      cnonce: "c",
      nc: 42,
    });

    expect(param(header, "nc")).toBe("0000002a");
  });

  it("escapes a username containing a quote", () => {
    const header = buildDigestAuthorization({
      challenge: parseDigestChallenge('Digest realm="a", nonce="b", qop="auth"')!,
      username: 'us"er',
      password: "p",
      method: "POST",
      uri: "/RPC2",
      cnonce: "c",
      nc: 1,
    });

    expect(header).toContain('username="us\\"er"');
  });

  it("keeps the query string in the digested uri", () => {
    const withQuery = buildDigestAuthorization({
      challenge: parseDigestChallenge('Digest realm="a", nonce="b", qop="auth"')!,
      username: "u",
      password: "p",
      method: "GET",
      uri: "/api?mode=version",
      cnonce: "c",
      nc: 1,
    });

    expect(param(withQuery, "uri")).toBe("/api?mode=version");
  });
});
