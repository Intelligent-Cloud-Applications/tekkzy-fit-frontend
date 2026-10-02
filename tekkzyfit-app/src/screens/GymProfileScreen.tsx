import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { saveGymSettings } from '../api';
import { errorMessage } from '../errors';
import { useGym } from '../GymContext';
import { ActionBar, ActionBtn, PageTitle, SectionTitle } from '../page';
import { useTheme } from '../theme';
import { pushToast } from '../toast';
import type { InvoiceSettings } from '../types';
import { ErrorText, Field, Label } from '../ui';

export function GymProfileScreen() {
  const t = useTheme();
  const { settings, setSettings } = useGym();
  const [draft, setDraft] = useState({
    gymName: settings?.gymName || '',
    legalName: settings?.legalName || '',
    phone: settings?.phone || '',
    email: settings?.email || '',
    address: settings?.address || '',
    city: settings?.city || '',
    state: settings?.state || '',
    pincode: settings?.pincode || '',
    gstin: settings?.gstin || '',
  });
  const [invoice, setInvoice] = useState<InvoiceSettings>({
    prefix: 'INV',
    terms: '1. Fees once paid are non-refundable and non-transferable.\n2. Membership is valid only for the period mentioned above.\n3. Members must follow gym rules and carry their ID.',
    ...(settings?.invoice || {}),
  });
  const [taxText, setTaxText] = useState(settings?.invoice?.taxPercent ? String(settings.invoice.taxPercent) : '');
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  function setInv(patch: Partial<InvoiceSettings>) {
    setInvoice((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }

  async function pickLogo() {
    setLogoBusy(true);
    setError('');
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      const out = await ImageManipulator.manipulateAsync(
        asset.uri,
        (asset.width || 0) > 360 ? [{ resize: { width: 360 } }] : [],
        { compress: 0.8, format: ImageManipulator.SaveFormat.WEBP, base64: true },
      );
      if (!out.base64) throw new Error('Could not read the image');
      if (out.base64.length > 150000) throw new Error('Logo is too large. Pick a simpler image.');
      setInv({ logo: `data:image/webp;base64,${out.base64}` });
    } catch (err) {
      setError(errorMessage(err, 'Could not load logo'));
    } finally {
      setLogoBusy(false);
    }
  }

  async function onSave() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const tax = Number(taxText.replace(/[^0-9.]/g, ''));
      const nextInvoice: InvoiceSettings = {
        ...invoice,
        prefix: (invoice.prefix || '').trim(),
        taxPercent: Number.isFinite(tax) && tax > 0 && tax <= 100 ? tax : 0,
        logo: invoice.logo || '',
      };
      const next = await saveGymSettings({ ...settings, ...draft, invoice: nextInvoice });
      setSettings(next);
      setSaved(true);
      pushToast({ kind: 'success', title: 'Settings saved' });
    } catch (err) {
      setError(errorMessage(err, 'Could not save gym profile'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <PageTitle>Gym profile</PageTitle>
        <Label>Gym name</Label>
        <Field value={draft.gymName} onChangeText={(gymName) => setDraft({ ...draft, gymName })} />
        <Label>Legal name</Label>
        <Field value={draft.legalName} onChangeText={(legalName) => setDraft({ ...draft, legalName })} />
        <Label>Phone</Label>
        <Field value={draft.phone} onChangeText={(phone) => setDraft({ ...draft, phone })} keyboardType="phone-pad" />
        <Label>Email</Label>
        <Field value={draft.email} onChangeText={(email) => setDraft({ ...draft, email })} autoCapitalize="none" keyboardType="email-address" />
        <Label>Address</Label>
        <Field value={draft.address} onChangeText={(address) => setDraft({ ...draft, address })} />
        <Label>City</Label>
        <Field value={draft.city} onChangeText={(city) => setDraft({ ...draft, city })} />
        <Label>State</Label>
        <Field value={draft.state} onChangeText={(state) => setDraft({ ...draft, state })} />
        <Label>PIN</Label>
        <Field value={draft.pincode} onChangeText={(pincode) => setDraft({ ...draft, pincode })} keyboardType="number-pad" />
        <Label>GSTIN</Label>
        <Field value={draft.gstin} onChangeText={(gstin) => setDraft({ ...draft, gstin })} autoCapitalize="characters" />

        <SectionTitle>Invoice</SectionTitle>
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, padding: 14, gap: 8 }}>
          <Label>Logo</Label>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable
              onPress={() => void pickLogo()}
              style={{ width: 72, height: 72, borderRadius: 12, borderWidth: 1, borderColor: t.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
            >
              {invoice.logo
                ? <Image source={{ uri: invoice.logo }} style={{ width: 68, height: 68 }} resizeMode="contain" />
                : <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '700' }}>Add logo</Text>}
            </Pressable>
            <View style={{ flex: 1 }}>
              <ActionBar>
                <ActionBtn title={invoice.logo ? 'Change' : 'Upload'} icon="image" busy={logoBusy} onPress={() => void pickLogo()} />
                {invoice.logo ? <ActionBtn title="Remove" onPress={() => setInv({ logo: '' })} /> : null}
              </ActionBar>
            </View>
          </View>
          <Label>Invoice number prefix</Label>
          <Field value={invoice.prefix || ''} onChangeText={(prefix) => setInv({ prefix })} autoCapitalize="characters" placeholder="INV" />
          <Label>Invoice title (optional)</Label>
          <Field value={invoice.title || ''} onChangeText={(title) => setInv({ title })} placeholder="INVOICE" />
          <Label>Website (optional)</Label>
          <Field value={invoice.website || ''} onChangeText={(website) => setInv({ website })} autoCapitalize="none" placeholder="www.yourgym.com" />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: t.text, fontSize: 13, fontWeight: '700' }}>Show GST breakup</Text>
            <Switch value={invoice.showGst !== false && Boolean(taxText)} onValueChange={(v) => { setInv({ showGst: v }); if (v && !taxText) setTaxText('18'); }} />
          </View>
          {invoice.showGst !== false && taxText ? (
            <>
              <Label>GST % (included in plan price)</Label>
              <Field value={taxText} onChangeText={(v) => { setTaxText(v); setSaved(false); }} keyboardType="decimal-pad" placeholder="18" />
            </>
          ) : null}
          <Label>UPI ID (optional)</Label>
          <Field value={invoice.upiId || ''} onChangeText={(upiId) => setInv({ upiId })} autoCapitalize="none" placeholder="gym@upi" />
          <Label>Bank details (optional)</Label>
          <Field value={invoice.bankDetails || ''} onChangeText={(bankDetails) => setInv({ bankDetails })} multiline placeholder={'Bank: …\nA/C: …\nIFSC: …'} />
          <Label>Note (optional)</Label>
          <Field value={invoice.note || ''} onChangeText={(note) => setInv({ note })} multiline placeholder="Thank you for choosing us!" />
          <Label>Terms & conditions</Label>
          <Field value={invoice.terms || ''} onChangeText={(terms) => setInv({ terms })} multiline style={{ height: 120 }} />
          <Label>Owner name (digital sign)</Label>
          <Field value={invoice.signatory || ''} onChangeText={(signatory) => setInv({ signatory })} placeholder="e.g. Rakesh Kumar" />
        </View>

        <ErrorText text={error} />
        {saved ? <Text style={{ marginTop: 10, color: t.muted, fontSize: 13 }}>Settings saved</Text> : null}
        <View style={{ marginTop: 16 }}>
          <ActionBtn title={saved ? 'Saved' : 'Save settings'} primary busy={busy} onPress={() => void onSave()} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
