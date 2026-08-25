"""
娱乐直播用户自动打标逻辑

适用表结构：
- users
- live_sessions
- user_live_interactions
- tag_definitions
- user_tags
- user_tagging_logs

核心规则：
1. S级用户：支持率 > 50%，总消费金额 > 10000，且愿意接话
2. A级用户：满足任一消费条件，且必须“无目的”
3. B级用户：支持率 < 30%，单笔消费 > 200，且出现过 3 次及以上
4. C级用户：每次只占榜和聊天
5. 特殊标签“目的用户”：单次消费 > 1000，但提出线下、吃饭或越界关系请求
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, Numeric, String, Text, delete, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship


class Base(DeclarativeBase):
    """SQLAlchemy ORM 基类。"""


class User(Base):
    """对应 users 表。"""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    nickname: Mapped[str] = mapped_column(String(100))
    tier: Mapped[str | None] = mapped_column(String(10), default=None)
    total_live_count: Mapped[int] = mapped_column(default=0)
    appeared_count: Mapped[int] = mapped_column(default=0)
    supported_count: Mapped[int] = mapped_column(default=0)
    support_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"))
    total_spend_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    latest_single_spend_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    high_single_spend_count: Mapped[int] = mapped_column(default=0)
    is_willing_to_reply: Mapped[bool] = mapped_column(Boolean, default=False)
    is_no_purpose: Mapped[bool] = mapped_column(Boolean, default=True)
    has_offline_meal_request: Mapped[bool] = mapped_column(Boolean, default=False)
    is_only_rank_and_chat: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[Any] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    tags: Mapped[list["UserTag"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class TagDefinition(Base):
    """对应 tag_definitions 表。"""

    __tablename__ = "tag_definitions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tag_name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    tag_type: Mapped[str] = mapped_column(String(30), default="normal")
    definition: Mapped[str | None] = mapped_column(Text, default=None)
    rule_description: Mapped[str | None] = mapped_column(Text, default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[Any] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[Any] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    user_tags: Mapped[list["UserTag"]] = relationship(back_populates="tag", cascade="all, delete-orphan")


class UserTag(Base):
    """对应 user_tags 表。"""

    __tablename__ = "user_tags"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tag_definitions.id", ondelete="CASCADE"), nullable=False)
    source: Mapped[str] = mapped_column(String(30), default="auto")
    reason: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[Any] = mapped_column(DateTime, server_default=func.now())

    user: Mapped[User] = relationship(back_populates="tags")
    tag: Mapped[TagDefinition] = relationship(back_populates="user_tags")


class UserTaggingLog(Base):
    """对应 user_tagging_logs 表。"""

    __tablename__ = "user_tagging_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    old_tier: Mapped[str | None] = mapped_column(String(10), default=None)
    new_tier: Mapped[str | None] = mapped_column(String(10), default=None)
    matched_rules: Mapped[str | None] = mapped_column(Text, default=None)
    calculated_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON, default=None)
    operator_type: Mapped[str] = mapped_column(String(30), default="system")
    created_at: Mapped[Any] = mapped_column(DateTime, server_default=func.now())


@dataclass
class Interaction:
    """对应 user_live_interactions 表中的一条互动记录。"""

    appeared: bool = True
    supported: bool = False
    spend_amount: Decimal = Decimal("0")
    is_willing_to_reply: bool = False
    has_offline_meal_request: bool = False
    is_only_rank_and_chat: bool = False
    topics: str = ""
    remark: str = ""


@dataclass
class UserMetrics:
    """从用户档案和互动记录中计算出的打标指标。"""

    user_id: int
    old_tier: str | None = None
    total_live_count: int = 0
    appeared_count: int = 0
    supported_count: int = 0
    support_rate: Decimal = Decimal("0")
    total_spend_amount: Decimal = Decimal("0")
    latest_single_spend_amount: Decimal = Decimal("0")
    high_single_spend_count: int = 0
    single_spend_over_200_count: int = 0
    is_willing_to_reply: bool = False
    is_no_purpose: bool = True
    has_offline_meal_request: bool = False
    is_only_rank_and_chat: bool = False


@dataclass
class TaggingResult:
    """自动打标结果，可写入 users、user_tags、user_tagging_logs。"""

    user_id: int
    old_tier: str | None
    new_tier: str
    tags: list[str] = field(default_factory=list)
    matched_rules: list[str] = field(default_factory=list)
    snapshot: dict[str, Any] = field(default_factory=dict)


DEFAULT_TAG_DEFINITIONS: dict[str, dict[str, str]] = {
    "高额支持": {
        "definition": "用户在直播间有较高打赏、守护或连续支持行为",
        "rule_description": "总消费金额较高，或存在单笔大额支持行为",
    },
    "稳定陪伴": {
        "definition": "用户经常出现，停留稳定，即使不一定每次都发言",
        "rule_description": "出现次数达到 3 次及以上",
    },
    "氛围带动": {
        "definition": "用户能接话、抛梗、暖场，让直播间不冷清",
        "rule_description": "互动记录中 is_willing_to_reply 为 true",
    },
    "点歌偏好": {
        "definition": "用户常点歌、聊音乐，或对某类表演内容反应明显",
        "rule_description": "话题中出现点歌、歌曲或音乐偏好",
    },
    "情绪支持": {
        "definition": "用户会在主播状态不好时安慰、鼓励或陪伴",
        "rule_description": "备注中出现安慰、鼓励等情绪支持行为",
    },
    "预算敏感": {
        "definition": "用户对打赏、守护或付费表达明显犹豫",
        "rule_description": "备注中出现没钱、预算、下次再支持等表达",
    },
    "新进观望": {
        "definition": "用户刚开始接触直播间，信息仍少",
        "rule_description": "出现次数小于等于 2 次",
    },
    "潜水守候": {
        "definition": "用户发言少，但停留时间长，偶尔关键时刻出现",
        "rule_description": "出现次数达到 3 次及以上，但接话少且消费金额较低",
    },
    "目的用户": {
        "definition": "用户单次消费金额较高，但提出线下、吃饭或越界关系请求",
        "rule_description": "单次消费 > 1000，同时提出见面、吃饭、私下关系等诉求",
    },
}


def calculate_user_metrics(
    user_id: int,
    old_tier: str | None,
    total_live_count: int,
    interactions: list[Interaction],
) -> UserMetrics:
    """根据直播总场次和用户互动明细计算用户指标。"""

    appeared_interactions = [item for item in interactions if item.appeared]
    supported_interactions = [item for item in interactions if item.supported or item.spend_amount > 0]

    appeared_count = len(appeared_interactions)
    supported_count = len(supported_interactions)
    total_spend_amount = sum((item.spend_amount for item in interactions), Decimal("0"))
    latest_single_spend_amount = interactions[-1].spend_amount if interactions else Decimal("0")
    high_single_spend_count = sum(1 for item in interactions if item.spend_amount > Decimal("1000"))
    single_spend_over_200_count = sum(1 for item in interactions if item.spend_amount > Decimal("200"))

    support_rate = Decimal("0")
    if total_live_count > 0:
        support_rate = Decimal(supported_count) / Decimal(total_live_count)

    has_offline_meal_request = any(item.has_offline_meal_request for item in interactions)

    return UserMetrics(
        user_id=user_id,
        old_tier=old_tier,
        total_live_count=total_live_count,
        appeared_count=appeared_count,
        supported_count=supported_count,
        support_rate=support_rate,
        total_spend_amount=total_spend_amount,
        latest_single_spend_amount=latest_single_spend_amount,
        high_single_spend_count=high_single_spend_count,
        single_spend_over_200_count=single_spend_over_200_count,
        is_willing_to_reply=any(item.is_willing_to_reply for item in interactions),
        is_no_purpose=not has_offline_meal_request,
        has_offline_meal_request=has_offline_meal_request,
        is_only_rank_and_chat=bool(interactions) and all(item.is_only_rank_and_chat for item in interactions),
    )


def classify_tier(metrics: UserMetrics) -> tuple[str, list[str]]:
    """按 S/A/B/C 顺序计算用户分层。"""

    matched_rules: list[str] = []

    is_s_user = (
        metrics.support_rate > Decimal("0.5")
        and metrics.total_spend_amount > Decimal("10000")
        and metrics.is_willing_to_reply
    )
    if is_s_user:
        matched_rules.append("S级：支持率 > 50%，总消费金额 > 10000，且愿意接话")
        return "S", matched_rules

    a_conditions = [
        metrics.total_spend_amount > Decimal("5000"),
        metrics.support_rate > Decimal("0.3") and metrics.latest_single_spend_amount > Decimal("500"),
        metrics.high_single_spend_count >= 3,
    ]
    is_a_user = any(a_conditions) and metrics.is_no_purpose
    if is_a_user:
        matched_rules.append("A级：满足金额/支持条件之一，且无目的")
        return "A", matched_rules

    is_b_user = (
        metrics.support_rate < Decimal("0.3")
        and metrics.single_spend_over_200_count >= 1
        and metrics.appeared_count >= 3
    )
    if is_b_user:
        matched_rules.append("B级：支持率 < 30%，单笔消费 > 200，且出现过 3 次及以上")
        return "B", matched_rules

    if metrics.is_only_rank_and_chat:
        matched_rules.append("C级：每次只占榜和聊天")
        return "C", matched_rules

    matched_rules.append("默认C级：暂未满足 S/A/B，继续观察")
    return "C", matched_rules


def infer_tags(metrics: UserMetrics, interactions: list[Interaction]) -> list[str]:
    """根据互动行为生成标签。标签可按业务继续增删。"""

    tags: list[str] = []

    if any(item.spend_amount > Decimal("1000") and item.has_offline_meal_request for item in interactions):
        tags.append("目的用户")

    if metrics.total_spend_amount > Decimal("5000") or metrics.high_single_spend_count >= 1:
        tags.append("高额支持")

    if metrics.appeared_count >= 3:
        tags.append("稳定陪伴")

    if metrics.is_willing_to_reply:
        tags.append("氛围带动")

    if any("点歌" in item.topics or "歌" in item.topics for item in interactions):
        tags.append("点歌偏好")

    if any("安慰" in item.remark or "鼓励" in item.remark for item in interactions):
        tags.append("情绪支持")

    if any("没钱" in item.remark or "预算" in item.remark or "下次再支持" in item.remark for item in interactions):
        tags.append("预算敏感")

    if metrics.appeared_count <= 2:
        tags.append("新进观望")

    if metrics.appeared_count >= 3 and not metrics.is_willing_to_reply and metrics.total_spend_amount <= Decimal("1000"):
        tags.append("潜水守候")

    return dedupe(tags)


def build_snapshot(metrics: UserMetrics) -> dict[str, Any]:
    """生成写入 user_tagging_logs.calculated_snapshot 的指标快照。"""

    return {
        "total_live_count": metrics.total_live_count,
        "appeared_count": metrics.appeared_count,
        "supported_count": metrics.supported_count,
        "support_rate": float(metrics.support_rate),
        "total_spend_amount": float(metrics.total_spend_amount),
        "latest_single_spend_amount": float(metrics.latest_single_spend_amount),
        "high_single_spend_count": metrics.high_single_spend_count,
        "single_spend_over_200_count": metrics.single_spend_over_200_count,
        "is_willing_to_reply": metrics.is_willing_to_reply,
        "is_no_purpose": metrics.is_no_purpose,
        "has_offline_meal_request": metrics.has_offline_meal_request,
        "is_only_rank_and_chat": metrics.is_only_rank_and_chat,
    }


def auto_tag_user(
    user_id: int,
    old_tier: str | None,
    total_live_count: int,
    interactions: list[Interaction],
) -> TaggingResult:
    """自动打标主入口。"""

    metrics = calculate_user_metrics(
        user_id=user_id,
        old_tier=old_tier,
        total_live_count=total_live_count,
        interactions=interactions,
    )
    new_tier, matched_rules = classify_tier(metrics)
    tags = infer_tags(metrics, interactions)

    return TaggingResult(
        user_id=user_id,
        old_tier=old_tier,
        new_tier=new_tier,
        tags=tags,
        matched_rules=matched_rules,
        snapshot=build_snapshot(metrics),
    )


def save_tagging_result(
    session: Session,
    result: TaggingResult,
    *,
    commit: bool = True,
    create_missing_tags: bool = True,
) -> User:
    """
    使用 SQLAlchemy ORM 写入自动打标结果。

    写入内容：
    1. 更新 users 表中的分层和计算指标
    2. 删除 user_tags 中旧的自动标签
    3. 写入本次自动识别出的标签
    4. 写入 user_tagging_logs 作为可追溯日志

    参数：
    - session：SQLAlchemy Session
    - result：auto_tag_user() 返回的打标结果
    - commit：是否在函数内部提交事务；如果外层已有事务，可传 False
    - create_missing_tags：标签字典不存在时是否自动创建
    """

    try:
        user = session.get(User, result.user_id)
        if user is None:
            raise ValueError(f"用户不存在，user_id={result.user_id}")

        snapshot = result.snapshot
        user.tier = result.new_tier
        user.total_live_count = int(snapshot["total_live_count"])
        user.appeared_count = int(snapshot["appeared_count"])
        user.supported_count = int(snapshot["supported_count"])
        user.support_rate = to_decimal(snapshot["support_rate"]) * Decimal("100")
        user.total_spend_amount = to_decimal(snapshot["total_spend_amount"])
        user.latest_single_spend_amount = to_decimal(snapshot["latest_single_spend_amount"])
        user.high_single_spend_count = int(snapshot["high_single_spend_count"])
        user.is_willing_to_reply = bool(snapshot["is_willing_to_reply"])
        user.is_no_purpose = bool(snapshot["is_no_purpose"])
        user.has_offline_meal_request = bool(snapshot["has_offline_meal_request"])
        user.is_only_rank_and_chat = bool(snapshot["is_only_rank_and_chat"])

        session.execute(
            delete(UserTag).where(
                UserTag.user_id == result.user_id,
                UserTag.source == "auto",
            )
        )

        reason = "；".join(result.matched_rules)
        tag_map = get_or_create_tag_definitions(
            session=session,
            tag_names=result.tags,
            create_missing=create_missing_tags,
        )
        for tag_name in result.tags:
            tag = tag_map.get(tag_name)
            if tag is None:
                continue
            session.add(
                UserTag(
                    user_id=result.user_id,
                    tag_id=tag.id,
                    source="auto",
                    reason=reason,
                )
            )

        session.add(
            UserTaggingLog(
                user_id=result.user_id,
                old_tier=result.old_tier,
                new_tier=result.new_tier,
                matched_rules=reason,
                calculated_snapshot=snapshot,
                operator_type="system",
            )
        )

        if commit:
            session.commit()
        else:
            session.flush()

        return user
    except Exception:
        if commit:
            session.rollback()
        raise


def get_or_create_tag_definitions(
    session: Session,
    tag_names: list[str],
    *,
    create_missing: bool = True,
) -> dict[str, TagDefinition]:
    """查询标签字典；不存在时可自动创建。"""

    unique_tag_names = dedupe(tag_names)
    if not unique_tag_names:
        return {}

    existing_tags = session.scalars(
        select(TagDefinition).where(TagDefinition.tag_name.in_(unique_tag_names))
    ).all()
    tag_map = {tag.tag_name: tag for tag in existing_tags}

    if not create_missing:
        return tag_map

    for tag_name in unique_tag_names:
        if tag_name in tag_map:
            continue
        tag = TagDefinition(
            tag_name=tag_name,
            tag_type="special" if tag_name == "目的用户" else "normal",
            definition=DEFAULT_TAG_DEFINITIONS.get(tag_name, {}).get("definition"),
            rule_description=DEFAULT_TAG_DEFINITIONS.get(tag_name, {}).get("rule_description"),
            is_active=True,
        )
        session.add(tag)
        tag_map[tag_name] = tag

    session.flush()
    return tag_map


def to_decimal(value: Any) -> Decimal:
    """把 int、float、str 安全转成 Decimal。"""

    return Decimal(str(value or 0))


def dedupe(items: list[str]) -> list[str]:
    """保持顺序去重。"""

    seen = set()
    result = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


if __name__ == "__main__":
    demo_interactions = [
        Interaction(appeared=True, supported=True, spend_amount=Decimal("1200"), is_willing_to_reply=True),
        Interaction(appeared=True, supported=True, spend_amount=Decimal("3600"), is_willing_to_reply=True),
        Interaction(appeared=True, supported=True, spend_amount=Decimal("5800"), is_willing_to_reply=True),
    ]

    demo_result = auto_tag_user(
        user_id=1,
        old_tier="A",
        total_live_count=5,
        interactions=demo_interactions,
    )

    print(demo_result)
