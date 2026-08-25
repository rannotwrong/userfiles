"""
自动打标逻辑单元测试

运行方式：
python3 -m unittest test_auto_tagging_logic.py
"""

from decimal import Decimal
import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from auto_tagging_logic import (
    Base,
    Interaction,
    TagDefinition,
    User,
    UserTag,
    UserTaggingLog,
    auto_tag_user,
    dedupe,
    save_tagging_result,
)


class AutoTaggingRuleTest(unittest.TestCase):
    """验证 S/A/B/C 分层和标签推断。"""

    def test_s_tier_requires_support_rate_amount_and_reply(self):
        interactions = [
            Interaction(supported=True, spend_amount=Decimal("3000"), is_willing_to_reply=True),
            Interaction(supported=True, spend_amount=Decimal("4000"), is_willing_to_reply=True),
            Interaction(supported=True, spend_amount=Decimal("4500"), is_willing_to_reply=True),
        ]

        result = auto_tag_user(
            user_id=1,
            old_tier="A",
            total_live_count=5,
            interactions=interactions,
        )

        self.assertEqual(result.new_tier, "S")
        self.assertIn("高额支持", result.tags)
        self.assertIn("稳定陪伴", result.tags)
        self.assertIn("氛围带动", result.tags)
        self.assertAlmostEqual(result.snapshot["support_rate"], 0.6)
        self.assertEqual(result.snapshot["total_spend_amount"], 11500.0)

    def test_s_tier_fails_without_reply_even_if_amount_is_high(self):
        interactions = [
            Interaction(supported=True, spend_amount=Decimal("4000")),
            Interaction(supported=True, spend_amount=Decimal("4000")),
            Interaction(supported=True, spend_amount=Decimal("4000")),
        ]

        result = auto_tag_user(
            user_id=2,
            old_tier="A",
            total_live_count=5,
            interactions=interactions,
        )

        self.assertNotEqual(result.new_tier, "S")
        self.assertEqual(result.new_tier, "A")

    def test_a_tier_by_total_amount_and_no_purpose(self):
        interactions = [
            Interaction(supported=True, spend_amount=Decimal("2600"), is_willing_to_reply=True),
            Interaction(supported=True, spend_amount=Decimal("2600"), is_willing_to_reply=True),
        ]

        result = auto_tag_user(
            user_id=3,
            old_tier="B",
            total_live_count=8,
            interactions=interactions,
        )

        self.assertEqual(result.new_tier, "A")
        self.assertTrue(result.snapshot["is_no_purpose"])

    def test_a_tier_blocked_when_user_has_purpose(self):
        interactions = [
            Interaction(
                supported=True,
                spend_amount=Decimal("6000"),
                is_willing_to_reply=True,
                has_offline_meal_request=True,
            )
        ]

        result = auto_tag_user(
            user_id=4,
            old_tier="B",
            total_live_count=10,
            interactions=interactions,
        )

        self.assertNotEqual(result.new_tier, "A")
        self.assertIn("目的用户", result.tags)
        self.assertFalse(result.snapshot["is_no_purpose"])

    def test_a_tier_by_three_high_single_spends(self):
        interactions = [
            Interaction(supported=True, spend_amount=Decimal("1200")),
            Interaction(supported=True, spend_amount=Decimal("1300")),
            Interaction(supported=True, spend_amount=Decimal("1400")),
        ]

        result = auto_tag_user(
            user_id=5,
            old_tier="B",
            total_live_count=20,
            interactions=interactions,
        )

        self.assertEqual(result.new_tier, "A")
        self.assertEqual(result.snapshot["high_single_spend_count"], 3)

    def test_b_tier_by_low_support_rate_single_spend_and_three_appearances(self):
        interactions = [
            Interaction(appeared=True, supported=False, spend_amount=Decimal("0")),
            Interaction(appeared=True, supported=True, spend_amount=Decimal("260")),
            Interaction(appeared=True, supported=False, spend_amount=Decimal("0")),
        ]

        result = auto_tag_user(
            user_id=6,
            old_tier=None,
            total_live_count=12,
            interactions=interactions,
        )

        self.assertEqual(result.new_tier, "B")
        self.assertAlmostEqual(result.snapshot["support_rate"], 1 / 12)

    def test_c_tier_when_only_rank_and_chat(self):
        interactions = [
            Interaction(appeared=True, is_only_rank_and_chat=True),
            Interaction(appeared=True, is_only_rank_and_chat=True),
        ]

        result = auto_tag_user(
            user_id=7,
            old_tier=None,
            total_live_count=8,
            interactions=interactions,
        )

        self.assertEqual(result.new_tier, "C")
        self.assertIn("C级", result.matched_rules[0])

    def test_infer_detail_tags_from_topics_and_remarks(self):
        interactions = [
            Interaction(
                appeared=True,
                supported=True,
                spend_amount=Decimal("80"),
                topics="今天点歌，想听一首慢歌",
                remark="预算有限，下次再支持",
            ),
            Interaction(
                appeared=True,
                supported=False,
                spend_amount=Decimal("0"),
                remark="主播低落时有安慰和鼓励",
            ),
        ]

        result = auto_tag_user(
            user_id=8,
            old_tier=None,
            total_live_count=6,
            interactions=interactions,
        )

        self.assertIn("点歌偏好", result.tags)
        self.assertIn("情绪支持", result.tags)
        self.assertIn("预算敏感", result.tags)
        self.assertIn("新进观望", result.tags)

    def test_dedupe_keeps_original_order(self):
        self.assertEqual(
            dedupe(["高额支持", "稳定陪伴", "高额支持", "目的用户"]),
            ["高额支持", "稳定陪伴", "目的用户"],
        )


class SaveTaggingResultOrmTest(unittest.TestCase):
    """验证 save_tagging_result() 的真实 ORM 写入。"""

    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def test_save_tagging_result_updates_user_tags_and_log(self):
        with self.SessionLocal() as session:
            user = User(id=1, nickname="小鱼", tier="B")
            manual_tag = TagDefinition(tag_name="手动保留", tag_type="normal")
            old_auto_tag = TagDefinition(tag_name="旧自动标签", tag_type="normal")
            session.add_all([user, manual_tag, old_auto_tag])
            session.flush()
            session.add_all(
                [
                    UserTag(user_id=user.id, tag_id=manual_tag.id, source="manual", reason="人工判断"),
                    UserTag(user_id=user.id, tag_id=old_auto_tag.id, source="auto", reason="旧规则"),
                ]
            )
            session.commit()

            result = auto_tag_user(
                user_id=1,
                old_tier="B",
                total_live_count=5,
                interactions=[
                    Interaction(supported=True, spend_amount=Decimal("3000"), is_willing_to_reply=True),
                    Interaction(supported=True, spend_amount=Decimal("4000"), is_willing_to_reply=True),
                    Interaction(supported=True, spend_amount=Decimal("4500"), is_willing_to_reply=True),
                ],
            )

            saved_user = save_tagging_result(session, result)

            self.assertEqual(saved_user.tier, "S")
            self.assertEqual(saved_user.total_live_count, 5)
            self.assertEqual(saved_user.appeared_count, 3)
            self.assertEqual(saved_user.supported_count, 3)
            self.assertEqual(saved_user.support_rate, Decimal("60.00"))
            self.assertEqual(saved_user.total_spend_amount, Decimal("11500.00"))

            tag_names = session.scalars(
                select(TagDefinition.tag_name)
                .join(UserTag, UserTag.tag_id == TagDefinition.id)
                .where(UserTag.user_id == 1)
                .order_by(TagDefinition.tag_name)
            ).all()

            self.assertIn("手动保留", tag_names)
            self.assertIn("高额支持", tag_names)
            self.assertIn("稳定陪伴", tag_names)
            self.assertIn("氛围带动", tag_names)
            self.assertNotIn("旧自动标签", tag_names)

            logs = session.scalars(select(UserTaggingLog).where(UserTaggingLog.user_id == 1)).all()
            self.assertEqual(len(logs), 1)
            self.assertEqual(logs[0].old_tier, "B")
            self.assertEqual(logs[0].new_tier, "S")
            self.assertIn("S级", logs[0].matched_rules)
            self.assertEqual(logs[0].calculated_snapshot["supported_count"], 3)

    def test_save_tagging_result_raises_when_user_not_found(self):
        with self.SessionLocal() as session:
            result = auto_tag_user(
                user_id=999,
                old_tier=None,
                total_live_count=1,
                interactions=[Interaction(supported=True, spend_amount=Decimal("100"))],
            )

            with self.assertRaises(ValueError):
                save_tagging_result(session, result)


if __name__ == "__main__":
    unittest.main()
