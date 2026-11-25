import { useEffect, useReducer, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { T } from './T';
import { Icon } from './Icon';
import { Button } from './Button';
import { illustrationAssets } from './illustrationAssets';
import { useWide } from '@/lib/layout';
import type { Row } from '@/lib/review';
import { color as C, opacity, radius, space } from '@/theme/tokens';
// @ts-ignore plain JS modules shared with the Next.js app: the same reader (pdf.js, CSV, photos) and Claude client
import { DocReader, docIconName, docMeta } from '../../../src/tracker/reader.js';
// @ts-ignore
import { sample } from '../../../src/tracker/api.js';

// Upload documents, web build (trial, Nov 25; Ongatu 229:18166 / 229:18563). The reading itself is the web's
// reader.js, unchanged. What is web-only here: the drop target and the file input are plain DOM elements
// (react-native-web renders into react-dom, so a .web.tsx file can use them); the rest is React Native.
const art = illustrationAssets.upload;

export function Upload({ model, onRows, onBusy }: { model: any; onRows: (rows: Row[], failed: number, clear: () => void) => void; onBusy?: (busy: boolean) => void }) {
  const wide = useWide();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const readerRef = useRef<any>(null);
  if (!readerRef.current) readerRef.current = new DocReader(bump);
  const reader = readerRef.current;
  reader.model = model;
  useEffect(() => { reader.init(sample); }, [reader]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const [hover, setHover] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Reading progress: same estimate as the web (a photo ~10 s, a text chunk ~5 s, easing towards 95%).
  const [readStart, setReadStart] = useState<number | null>(null);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    onBusy?.(!!reader.analyzing);
    if (!reader.analyzing) { setReadStart(null); return undefined; }
    setReadStart(Date.now());
    const t = setInterval(tick, 120);
    return () => clearInterval(t);
  }, [reader.analyzing]);

  const analyze = async () => {
    setStatus(null);
    const res = await reader.analyze(model);
    if (!res || res.aborted) return;
    if (res.rows.length) onRows(res.rows, reader.docs.filter((d: any) => d.status === 'error' || d.status === 'empty').length, () => reader.clear());
    else {
      const readable = reader.docs.some((d: any) => d.status === 'empty' || d.status === 'done');
      setStatus(res.fatal ? "Couldn't read these files right now. Try again in a moment." : readable ? 'No entries found in these files.' : "Couldn't read these files.");
    }
  };

  const enabled = reader.ready && !!reader.sampleFn;
  const readingDocs = reader.docs.filter((d: any) => ['reading', 'done', 'empty'].includes(d.status) || (d.status === 'error' && d.wasRead));
  const elapsed = readStart ? Date.now() - readStart : 0;
  const prog = (d: any) => (d.status !== 'reading' ? 1 : 0.95 * (1 - Math.exp(-elapsed / (d.kind === 'image' || (d.images && d.images.length) ? 10000 : 5000 * Math.max(1, (d.chunks || []).length)))));
  const progress = readingDocs.length ? readingDocs.reduce((a: number, d: any) => a + prog(d), 0) / readingDocs.length : 0;
  const anyPrep = reader.docs.some((d: any) => d.status === 'preparing');
  const anyReady = reader.docs.some((d: any) => d.status === 'ready');
  const pick = () => { if (!reader.analyzing && enabled) fileRef.current?.click(); };

  return (
    <View style={{ gap: space.md }} nativeID="ap-upload">
      <T v="HeadingLarge" accessibilityRole="header">Upload documents</T>
      {reader.analyzing ? (
        <View style={s.reading} nativeID="dz-reading" accessibilityRole="progressbar">
          <View style={{ alignItems: 'center', gap: space.tn }}>
            <SvgXml xml={art.xml} width={35} height={Math.round((35 * art.height) / art.width)} />
            <T v="BodySmallMedium">{`Reading ${readingDocs.length} ${readingDocs.length === 1 ? 'file' : 'files'}`}</T>
            <T v="BodyTinyRegular" c={C.textSecondary}>It may take a few seconds.</T>
          </View>
          <View style={{ width: '100%', maxWidth: 404, alignItems: 'center', gap: space.xs }}>
            <View style={s.track}><View style={[s.fill, { width: `${Math.max(4, progress * 100)}%` }]} /></View>
            <T v="BodySmallRegular">{`${Math.round(progress * 100)}%`}</T>
          </View>
        </View>
      ) : (
        // The drop target: a DOM div (drag and drop has no React Native equivalent).
        <div id="dropzone" role="button" aria-label="Upload documents" tabIndex={enabled ? 0 : -1} aria-disabled={!enabled}
          onClick={pick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
          onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); setStatus(null); reader.add(e.dataTransfer && e.dataTransfer.files); }}
          style={{ display: 'flex', cursor: enabled ? 'pointer' : 'not-allowed', outline: 'none', opacity: enabled ? 1 : opacity.disabled }}>
          <View style={[s.drop, wide ? s.dropWide : s.dropPhone, (hover && enabled) && { borderColor: C.borderHover }, over && { borderColor: C.borderFocus, backgroundColor: C.surfaceAccentLight }]}>
            <View style={s.line}>
              <Icon name="upload" size={16} fill={hover ? C.linkHover : C.linkDefault} />
              <T pinned v="LabelTiny" w="LabelSmall" c={hover ? C.linkHover : C.linkDefault} style={hover ? s.underline : undefined}>{wide ? 'Click to upload' : 'Upload your file'}</T>
              {wide && <T pinned v="BodySmallMedium">or drag and drop your file here</T>}
            </View>
            <T v="BodyTinyRegular" w="BodySmallRegular" c={C.textSecondary} style={{ textAlign: 'center' }}>
              {reader.ready && reader.imgCaps() ? 'JPG, PNG, PDF or CSV. Add as many as you like.' : 'PDF or CSV. Add as many as you like.'}
            </T>
          </View>
        </div>
      )}
      {!!(reader.offReason || reader.imagesNote) && <T v="BodyTinyRegular" c={C.textSecondary}>{reader.offReason ? reader.offReason + ' You can still enter the entry by hand below.' : reader.imagesNote}</T>}
      <input ref={fileRef} type="file" id="file-input" multiple hidden accept={reader.ready ? reader.accept() : undefined}
        onChange={(e) => { setStatus(null); reader.add(e.target.files); e.target.value = ''; }} />
      {!reader.analyzing && reader.docs.length > 0 && (
        <View style={{ gap: space.md }} nativeID="doc-list">
          {reader.docs.map((d: any) => {
            const bad = d.status === 'error' || d.status === 'empty';
            return (
              <View key={d.id} style={s.doc}>
                <Icon name={docIconName(d) === 'image' ? 'image' : 'document'} size={wide ? 16 : 20} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T v="BodySmallMedium" numberOfLines={1}>{d.name}</T>
                  <T v="BodyTinyRegular" c={bad ? C.statusFail : C.textSecondary}>{docMeta(d)}</T>
                </View>
                {d.status === 'preparing' ? <T v="BodyTinyRegular">{d.pct}%</T>
                  : d.status === 'reading' ? null
                  : (
                    // Tiny round X (as the web's .doc-remove), named for screen readers (bug bash: it read "×").
                    <Pressable onPress={() => { setStatus(null); reader.remove(d.id); }} accessibilityRole="button" accessibilityLabel={'Remove ' + d.name}
                      style={({ hovered, pressed }: any) => [s.rm, (hovered || pressed) && { backgroundColor: C.actionSecondaryActive }]}>
                      <Icon name="x" size={16} />
                    </Pressable>
                  )}
              </View>
            );
          })}
          <View style={s.actions} nativeID="doc-actions">
            <Button nativeID="doc-add" label="Add files" size="small" disabled={reader.analyzing || anyPrep || !anyReady} onPress={analyze} />
            {status && <T v="BodySmallRegular" c={C.statusFail} nativeID="doc-status">{status}</T>}
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  drop: { flex: 1, borderWidth: 1, borderStyle: 'dashed', borderColor: C.borderDefault, borderRadius: radius.sm, backgroundColor: C.surfaceBody, alignItems: 'center', justifyContent: 'center', gap: space.tn },
  dropWide: { minHeight: 160, paddingVertical: space.xl, paddingHorizontal: space.lg },
  dropPhone: { minHeight: 166, padding: space.md },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.tn, flexWrap: 'wrap' },
  underline: { textDecorationLine: 'underline' },
  reading: { height: 160, borderWidth: 1, borderColor: C.borderDefault, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingHorizontal: space.lg },
  track: { width: '100%', height: 8, borderRadius: radius.full, backgroundColor: C.surfaceSecondary, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full, backgroundColor: '#17a768' },
  doc: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, minHeight: 32 },
  rm: { width: 32, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
});
