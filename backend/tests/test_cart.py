import pytest

from app.auth.quota import QuotaService
from app.cart.service import CartError, CartService
from app.state import MemoryState

HOBBIT, DRACULA = "OL27482W", "OL85892W"


class Clock:
    def __init__(self):
        self.now = 1_000_000.0

    def __call__(self):
        return self.now


@pytest.fixture()
def cart(svc):
    clock = Clock()
    service = CartService(MemoryState(), svc.catalog, hold_seconds=600, max_items=2, max_quantity=5, clock=clock)
    service.clock = clock
    service.changes, service.scheduled = [], []

    async def listener(uid, view, op_id):
        service.changes.append((uid, len(view.items), op_id))

    async def scheduler(uid, expires_at):
        service.scheduled.append((uid, expires_at))

    service.on_change(listener)
    service.set_hold_scheduler(scheduler)
    return service


async def test_set_semantics_make_a_repeated_call_harmless(cart):
    await cart.set_item("u1", HOBBIT, 1, "op-a")
    view = await cart.set_item("u1", HOBBIT, 1, "op-b")  # the model issued the same call twice
    assert [(i.id, i.quantity) for i in view.items] == [(HOBBIT, 1)]


async def test_replayed_operation_changes_nothing_and_notifies_nobody(cart):
    await cart.set_item("u1", HOBBIT, 2, "op-a")
    await cart.set_item("u1", HOBBIT, 5, "op-b")
    view = await cart.set_item("u1", HOBBIT, 2, "op-a")  # replay of the first write
    assert view.items[0].quantity == 5
    assert len(cart.changes) == 2


async def test_price_and_title_come_from_the_catalog(cart, svc):
    view = await cart.set_item("u1", HOBBIT, 2, "op-a")
    entry = svc.catalog.entry(HOBBIT)
    assert view.items[0].price_cents == entry.price_cents and view.total_cents == 2 * entry.price_cents


async def test_limits(cart):
    with pytest.raises(CartError) as exc:
        await cart.set_item("u1", "OL404W", 1, "op-a")
    assert exc.value.code == "unknown_book"
    with pytest.raises(CartError):
        await cart.set_item("u1", HOBBIT, 6, "op-b")
    await cart.set_item("u1", HOBBIT, 1, "op-c")
    await cart.set_item("u1", DRACULA, 1, "op-d")
    with pytest.raises(CartError) as exc:
        await cart.set_item("u1", "OL66554W", 1, "op-e")
    assert exc.value.code == "cart_full"


async def test_hold_is_scheduled_and_expires(cart):
    view = await cart.set_item("u1", HOBBIT, 1, "op-a")
    assert view.hold_expires_at == cart.clock.now + 600
    assert cart.scheduled == [("u1", view.hold_expires_at)]

    cart.clock.now += 300
    assert (await cart.expire("u1", expected_expiry=view.hold_expires_at)).items  # too early: no-op

    cart.clock.now += 301
    assert (await cart.expire("u1", expected_expiry=view.hold_expires_at)).items == []
    assert cart.changes[-1] == ("u1", 0, "hold-expired")


async def test_stale_timer_is_ignored_after_the_hold_was_renewed(cart):
    first = await cart.set_item("u1", HOBBIT, 1, "op-a")
    cart.clock.now += 500
    second = await cart.set_item("u1", DRACULA, 1, "op-b")
    cart.clock.now = first.hold_expires_at + 1  # the first task fires
    assert len((await cart.expire("u1", expected_expiry=first.hold_expires_at)).items) == 2
    assert second.hold_expires_at > first.hold_expires_at


async def test_read_expires_lazily_when_the_timer_was_lost(cart):
    await cart.set_item("u1", HOBBIT, 1, "op-a")
    cart.clock.now += 601
    assert (await cart.get("u1")).items == []


async def test_quota_counts_per_user_and_globally():
    clock = Clock()
    quota = QuotaService(MemoryState(), per_user=2, global_cap=3, clock=clock)
    assert (await quota.try_start("a")).sessions_left_today == 1
    assert (await quota.try_start("a")).allowed
    denied = await quota.try_start("a")
    assert not denied.allowed and denied.reason == "user"
    assert (await quota.try_start("b")).allowed           # third session of the day
    denied = await quota.try_start("c")                   # new uids do not get around the global cap
    assert not denied.allowed and denied.reason == "global"
    clock.now += 86_400
    assert (await quota.try_start("c")).allowed           # a new day
