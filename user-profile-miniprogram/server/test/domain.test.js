import test from "node:test";
import assert from "node:assert/strict";

import {
  toDbAudienceUser,
  validateAudienceUser
} from "../src/audienceUsers.js";
import {
  parseLiveRecordText,
  toDbLiveRecord,
  validateLiveRecord
} from "../src/liveRecords.js";

test("audience user validation rejects invalid identity fields", () => {
  assert.equal(validateAudienceUser({ nickname: "" }), "昵称不能为空");
  assert.equal(validateAudienceUser({ nickname: "小满", tier: "X" }), "用户分层只能是 S、A、B、C");
  assert.equal(validateAudienceUser({ nickname: "长".repeat(61) }), "昵称不能超过 60 个字符");
});

test("audience user mapping normalizes values", () => {
  const row = toDbAudienceUser({
    nickname: "  小满  ",
    tier: "S",
    manualTags: "稳定陪伴、情绪支持",
    amount: "¥1,200",
    isNoPurpose: "false"
  }, "owner-1");

  assert.equal(row.owner_id, "owner-1");
  assert.equal(row.nickname, "小满");
  assert.deepEqual(row.tags, ["稳定陪伴", "情绪支持"]);
  assert.equal(row.total_spend_amount, 1200);
  assert.equal(row.is_no_purpose, false);
});

test("live record parser extracts structured fields", () => {
  assert.deepEqual(
    parseLiveRecordText("日期：2026-08-27，总收入 ¥5,600，送礼人数 12，新用户送礼人数 3，评分 88"),
    {
      date: "2026-08-27",
      totalRevenue: 5600,
      giftUserCount: 12,
      newGiftUserCount: 3,
      topGift: "",
      score: 88
    }
  );
});

test("live record validation rejects out-of-range and invalid values", () => {
  assert.equal(validateLiveRecord({ score: -1 }), "评分需要在 0 到 100 之间");
  assert.equal(validateLiveRecord({ score: 101 }), "评分需要在 0 到 100 之间");
  assert.equal(validateLiveRecord({ totalRevenue: -1 }), "总收入不能小于 0");
  assert.equal(validateLiveRecord({ giftUserCount: -1 }), "送礼人数不能小于 0");
});

test("live record mapping stores safe numeric values", () => {
  const row = toDbLiveRecord({
    date: "2026-08-27",
    totalRevenue: "¥1,200",
    giftUserCount: 4,
    newGiftUserCount: 1,
    score: 90
  }, "owner-1");

  assert.equal(row.total_revenue, 1200);
  assert.equal(row.gift_user_count, 4);
  assert.equal(row.score, 90);
});
