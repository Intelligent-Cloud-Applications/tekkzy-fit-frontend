import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { removePlan } from '../api';
import { ConfirmDialog } from '../confirm';
import { errorMessage } from '../errors';
import { feedbackDeleted } from '../feedback';
import { pushToast } from '../toast';
import { billingLabel, formatINR } from '../format';
import { useGym } from '../GymContext';
import { Icon } from '../icons';
import type { RootStackParamList } from '../nav';
import { IconBtn, PageTitle, ScreenPad, SearchBox } from '../page';
import { useTheme } from '../theme';
import { Empty, ErrorText, StatusBadge } from '../ui';

export function PlansScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const t = useTheme();
  const { plans, members, loading, error, setPlans } = useGym();
  const [q, setQ] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return plans;
    return plans.filter((plan) => `${plan.name} ${plan.description || ''} ${billingLabel(plan)}`.toLowerCase().includes(query));
  }, [plans, q]);

  async function deletePlan() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await removePlan(pendingDelete.id);
      setPlans(plans.filter((p) => p.id !== pendingDelete.id));
      feedbackDeleted();
      setPendingDelete(null);
      pushToast({ kind: 'success', title: 'Plan deleted' });
    } catch (err) {
      pushToast({ kind: 'error', title: errorMessage(err, 'Could not delete') });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenPad>
        <PageTitle>Plans</PageTitle>
        <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SearchBox
            style={{ flex: 1 }}
            value={q}
            onChange={setQ}
            placeholder="Search plans"
          />
          <Pressable
            onPress={() => navigation.navigate('PlanForm', {})}
            style={{
              height: 40,
              borderRadius: 999,
              backgroundColor: t.accent,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="plus" color={t.accentInk} size={15} />
            <Text style={{ color: t.accentInk, fontSize: 13, fontWeight: '700' }}>Add plan</Text>
          </Pressable>
        </View>
        <ErrorText text={error} />
      </ScreenPad>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 40 }}
        ListEmptyComponent={!loading ? <Empty text={q ? 'No plans match this search.' : 'No plans yet.'} /> : null}
        renderItem={({ item }) => {
          const count = members.filter((m) => m.planId === item.id || m.membership?.planId === item.id).length;
          const price = Number(item.addonAmount || 0) > 0
            ? `${formatINR(item.price)} + ${formatINR(Number(item.addonAmount))}`
            : formatINR(item.price);
          return (
            <View style={{ marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, paddingHorizontal: 12, paddingVertical: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 14, fontWeight: '700' }}>{item.name}</Text>
                    <StatusBadge compact value={item.status || 'ACTIVE'} />
                  </View>
                  <Text numberOfLines={1} style={{ marginTop: 4, color: t.muted, fontSize: 12 }}>
                    {price} · {billingLabel(item)} · {count} {count === 1 ? 'member' : 'members'}
                  </Text>
                  {item.description ? (
                    <Text numberOfLines={1} style={{ marginTop: 2, color: t.muted, fontSize: 11 }}>{item.description}</Text>
                  ) : null}
                </View>
                <View>
                  <IconBtn name="pencil" color={t.muted} onPress={() => navigation.navigate('PlanForm', { planId: item.id })} />
                  <IconBtn name="trash" color={t.name === 'light' ? '#c81e1e' : '#ff6b6b'} onPress={() => setPendingDelete({ id: item.id, name: item.name })} />
                </View>
              </View>
            </View>
          );
        }}
      />
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete plan"
        message="Existing memberships keep their current price. This plan will no longer be offered."
        confirmLabel="Delete"
        danger
        busy={deleting}
        onClose={() => { if (!deleting) setPendingDelete(null); }}
        onConfirm={() => void deletePlan()}
      />
    </View>
  );
}
