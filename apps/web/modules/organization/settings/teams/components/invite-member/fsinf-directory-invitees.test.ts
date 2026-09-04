import { describe, expect, test } from "vitest";
import { buildInviteesFromDirectory } from "./fsinf-directory-invitees";

const member = (email: string, name = "Erika Musterfrau") => ({
  id: email,
  name,
  email,
  username: email.split("@")[0],
});

describe("buildInviteesFromDirectory", () => {
  test("maps picked Authentik members to invitees", () => {
    expect(buildInviteesFromDirectory([member("20066@nordakademie.de")], false)).toEqual([
      { name: "Erika Musterfrau", email: "20066@nordakademie.de", role: "owner", teamIds: [] },
    ]);
  });

  test("invites as member once access control is licensed", () => {
    const [invitee] = buildInviteesFromDirectory([member("20066@nordakademie.de")], true);

    expect(invitee.role).toBe("member");
  });

  test("lower-cases the address and drops a duplicate pick", () => {
    const invitees = buildInviteesFromDirectory(
      [member("Arne.Weber@nak-inf.org", "Arne Weber"), member("arne.weber@nak-inf.org", "Arne Weber")],
      false
    );

    expect(invitees).toHaveLength(1);
    expect(invitees[0].email).toBe("arne.weber@nak-inf.org");
  });

  test("trims a padded display name", () => {
    const [invitee] = buildInviteesFromDirectory([member("20067@nordakademie.de", "  Jan Doe  ")], false);

    expect(invitee.name).toBe("Jan Doe");
  });

  test("ignores an entry without an address", () => {
    expect(buildInviteesFromDirectory([member("", "Ohne Mail")], false)).toEqual([]);
  });
});
