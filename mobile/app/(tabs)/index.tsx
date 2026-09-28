import { useRef } from 'react';
import { RefreshControl, ScrollView, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScrollToTop } from 'expo-router';
import { useSession } from '@/lib/session';
import { fmtFigure, fmtMoney, fmtMoneyShort, MONTH_NAMES } from '@/lib/shared';
import { T } from '@/components/T';
import { Icon } from '@/components/Icon';
import { TAB_BAR_SPACE } from '@/components/OkaraTabBar';
import { color as C, space, radius } from '@/theme/tokens';

// Same rule as the web header (react-rewrite decision 1): email part before the first . - _ + or digit, capitalised.
const firstName = (email?: string | null, name?: string | null) => {
  const n = (name || '').trim().split(/\s+/)[0] || (email || '').split('@')[0].split(/[.\-_+0-9]/)[0];
  return n ? n[0].toUpperCase() + n.slice(1) : '';
};

// Home, first slice of "Ongatu - Main page - mobile" (342:7993): greeting, Balance card, KPI cards.
// Year/month selector, Tracker, Allocation, Trend and At a glance come next in the spike.
export default function Home() {
  const { me, model, data, error, reload } = useSession();
  const insets = useSafeAreaInsets();
  const ref = useRef<ScrollView>(null);
  useScrollToTop(ref); // tapping Home again scrolls to the top

  const body = () => {
    if (error) return <Card><T v="BodyMediumMedium" c={C.statusFail}>{error}</T></Card>;
    if (me && me.status !== 'approved') return <Card><T v="HeadingMedium">{me.status === 'blocked' ? 'Account blocked' : 'Waiting for approval'}</T><T v="BodyMediumRegular" c={C.textSecondary}>{me.status === 'blocked' ? 'Contact the owner of this Ongatu.' : 'You will get access once your account is approved.'}</T></Card>;
    if (!model || !data) return <Card><T v="BodyMediumRegular" c={C.textSecondary}>Loading…</T></Card>;
    const cur = model.currentYearMonthIndex();
    const years = model.DATA ?? [];
    const yi = cur ? cur.yearIdx : Math.max(0, years.length - 1);
    const y = years[yi];
    if (!y) return null;
    const mi = cur ? cur.monthIndex : model.defaultMonth(y);
    const c = model.computeMonth(y, mi);
    const prev = mi > 0 ? model.computeMonth(y, mi - 1) : null;
    const d = prev ? c.balance - prev.balance : 0;
    const rate = c.income > 0 ? Math.round(Math.max(0, Math.min(1, c.invest / c.income)) * 100) : null;
    return (
      <>
        <Card pad={space.lg} r={radius.card}>
          <T v="HeadingSmall" c={C.textSecondary}>BALANCE THIS MONTH</T>
          <T v="ValueXL" accessibilityLabel={`Balance ${fmtMoney(c.balance, y.currency)}`}>{fmtMoney(c.balance, y.currency)}</T>
          {prev && <T v="ValueSmall" c={d >= 0 ? C.statusSuccess : C.statusFail}>{d >= 0 ? '↑' : '↓'} {fmtMoneyShort(Math.abs(d), y.currency)} vs last month</T>}
          <T v="BodySmallRegular" c={C.textSecondary}>{MONTH_NAMES[mi]} {y.year}</T>
        </Card>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Kpi label="INCOMES" dot={C.surfaceAccent} value={c.income} />
          <Kpi label="EXPENSES" dot={C.dataPink} value={c.expenseTotal} />
        </View>
        <Kpi label="SAVINGS & INVESTMENTS" dot={C.dataLime} value={c.invest} detail={rate == null ? 'No income recorded' : `${rate}% rate of monthly incomes`} />
      </>
    );
  };

  return (
    <ScrollView ref={ref} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: TAB_BAR_SPACE + insets.bottom, paddingHorizontal: space.md, gap: space.lg }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}>
      <View style={s.topNav}><Icon name="user" size={20} fill="transparent" /></View>
      <View style={{ gap: space.xs }}>
        <T v="DisplayTitle" accessibilityRole="header">Hey, {firstName(me?.email, me?.name)}</T>
        <T v="BodyLargeMedium" c={C.textSecondary}>Ready to see where you stand today? Track your spending and savings for the month.</T>
      </View>
      {body()}
    </ScrollView>
  );
}

function Card({ children, pad = space.md, r = radius.md }: { children: React.ReactNode; pad?: number; r?: number }) {
  return <View style={{ backgroundColor: C.surfacePrimary, borderRadius: r, padding: pad, gap: space.xs }}>{children}</View>;
}
function Kpi({ label, dot, value, detail }: { label: string; dot: string; value: number; detail?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} /><T v="BodyMediumMedium">{label}</T></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.tn }}><T v="ValueMedium">€</T><T v="ValueMedium">{fmtFigure(value)}</T></View>
        {detail && <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}><Icon name="arrowUp" size={12} fill={C.surfaceTertiary} /><T v="ValueSmall" c={C.textSecondary}>{detail}</T></View>}
      </Card>
    </View>
  );
}

const s = StyleSheet.create({ topNav: { height: 48, alignItems: 'flex-end', justifyContent: 'center' } });
