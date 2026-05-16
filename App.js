import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';

const THEME = {
  bg: '#12070f',
  card: '#220d19',
  accent: '#ff4d79',
  accentSoft: '#ff7da3',
  normal: '#6ee7ff',
  pathology: '#ff6b6b',
  muted: '#b88aa0',
  axis: '#74515f',
  white: '#ffeef4',
};

const COMPONENT_INFO = {
  P: {
    title: 'P wave',
    electrical: 'Atrial depolarization initiated by SA node discharge.',
    heart: 'Right and left atrial myocardium.',
    ions: 'Fast Na+ entry plus L-type Ca2+ conduction through atrial tissue.',
    duration: 'Normal: <120 ms',
  },
  PR: {
    title: 'PR interval',
    electrical: 'Impulse delay from atria to ventricles via AV node.',
    heart: 'AV node, His bundle, proximal Purkinje system.',
    ions: 'Slow Ca2+ nodal conduction with reduced fast Na+ current.',
    duration: 'Normal: 120-200 ms',
  },
  QRS: {
    title: 'QRS complex',
    electrical: 'Rapid ventricular depolarization.',
    heart: 'Ventricular septum and free walls via Purkinje fibers.',
    ions: 'Dominant fast Na+ influx in ventricular myocytes.',
    duration: 'Normal: 70-110 ms',
  },
  ST: {
    title: 'ST segment',
    electrical: 'Early ventricular repolarization plateau phase.',
    heart: 'Uniformly depolarized ventricles.',
    ions: 'L-type Ca2+ inward current balanced by delayed K+ outward current.',
    duration: 'Normal: usually isoelectric; variable with HR',
  },
  T: {
    title: 'T wave',
    electrical: 'Ventricular repolarization.',
    heart: 'Ventricular myocardium.',
    ions: 'Delayed rectifier K+ currents dominate repolarization.',
    duration: 'Normal: ~160-200 ms',
  },
  QT: {
    title: 'QT interval',
    electrical: 'Total ventricular depolarization + repolarization.',
    heart: 'Entire ventricular myocardium.',
    ions: 'Combined Na+, Ca2+, and K+ phases of ventricular action potential.',
    duration: 'Normal QTc: ~350-450 ms (men), 360-460 ms (women)',
  },
};

const DISEASES = {
  ischemia: {
    label: 'Myocardial ischemia',
    why: 'Subendocardial ischemia shifts repolarization vectors, depressing ST segment.',
    highlight: 'ST depression',
  },
  infarction: {
    label: 'Myocardial infarction',
    why: 'Transmural injury current elevates ST segment in affected leads.',
    highlight: 'ST elevation',
  },
  hyperkalemia: {
    label: 'Hyperkalemia',
    why: 'Raised extracellular K+ accelerates repolarization and sharpens T waves.',
    highlight: 'Tall peaked T waves',
  },
  hypokalemia: {
    label: 'Hypokalemia',
    why: 'Low K+ delays repolarization, producing prominent U waves.',
    highlight: 'U waves',
  },
  lvh: {
    label: 'Left ventricular hypertrophy',
    why: 'Increased LV mass generates higher depolarization voltage.',
    highlight: 'High-voltage QRS',
  },
  bbb: {
    label: 'Bundle branch block',
    why: 'Delayed intraventricular conduction broadens and notches QRS.',
    highlight: 'Widened QRS',
  },
  afib: {
    label: 'Atrial fibrillation',
    why: 'Chaotic atrial activity removes organized P waves and causes fibrillatory baseline.',
    highlight: 'Absent P waves + irregular baseline',
  },
};

const GRAPH_HEIGHT = 300;
const GRAPH_MARGIN = 16;
const SAMPLES = 920;
const BASELINE_Y = GRAPH_HEIGHT / 2;

const gaussian = (x, mu, sigma, amp) => amp * Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2));

const waveAt = (phase, activeDiseases = []) => {
  const pSuppressed = activeDiseases.includes('afib');
  const qrsScale = activeDiseases.includes('lvh') ? 1.8 : 1;
  const qrsWidth = activeDiseases.includes('bbb') ? 1.6 : 1;
  const tBoost = activeDiseases.includes('hyperkalemia') ? 1.9 : 1;
  const tNarrow = activeDiseases.includes('hyperkalemia') ? 0.5 : 1;

  let signal =
    (pSuppressed ? 0 : gaussian(phase, 0.18, 0.03, 0.12)) +
    gaussian(phase, 0.365, 0.008 * qrsWidth, -0.14 * qrsScale) +
    gaussian(phase, 0.4, 0.01 * qrsWidth, 1.0 * qrsScale) +
    gaussian(phase, 0.44, 0.011 * qrsWidth, -0.25 * qrsScale) +
    gaussian(phase, 0.68, 0.07 * tNarrow, 0.34 * tBoost);

  if (activeDiseases.includes('hypokalemia')) {
    signal += gaussian(phase, 0.83, 0.03, 0.16);
  }

  if (phase >= 0.47 && phase <= 0.59) {
    if (activeDiseases.includes('ischemia')) {
      signal -= 0.1;
    }
    if (activeDiseases.includes('infarction')) {
      signal += 0.16;
    }
  }

  if (activeDiseases.includes('afib')) {
    signal += 0.028 * Math.sin(phase * 80) + 0.02 * Math.sin(phase * 137 + 1.8);
  }

  return signal;
};

const buildPath = (width, phaseShift, activeDiseases) => {
  const points = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const x = GRAPH_MARGIN + (i / SAMPLES) * (width - GRAPH_MARGIN * 2);
    const beatPhase = ((i / SAMPLES) * 2 + phaseShift) % 1;
    const y = BASELINE_Y - waveAt(beatPhase, activeDiseases) * 110;
    points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return points.join(' ');
};

export default function App() {
  const [selectedKey, setSelectedKey] = useState('P');
  const [activeDiseases, setActiveDiseases] = useState([]);
  const [comparisonMode, setComparisonMode] = useState(true);
  const [fade, setFade] = useState(0.5);
  const [phaseShift, setPhaseShift] = useState(0);
  const [graphWidth, setGraphWidth] = useState(1080);
  const viewShotRef = useRef(null);

  useEffect(() => {
    let frame;
    let previous = Date.now();

    const animate = () => {
      const now = Date.now();
      const dt = (now - previous) / 1000;
      previous = now;
      setPhaseShift((prev) => (prev + dt * 0.23) % 1);
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  const normalPath = useMemo(() => buildPath(graphWidth, phaseShift, []), [graphWidth, phaseShift]);
  const diseasePath = useMemo(
    () => buildPath(graphWidth, phaseShift, activeDiseases),
    [activeDiseases, graphWidth, phaseShift],
  );

  const selectedInfo = COMPONENT_INFO[selectedKey];
  const diseaseNotes = activeDiseases.map((key) => DISEASES[key]);

  const toggleDisease = (key) => {
    setActiveDiseases((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const shareFile = async (fileUri, mimeType) => {
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Exported', `Saved to ${fileUri}`);
      return;
    }
    await Sharing.shareAsync(fileUri, { mimeType });
  };

  const exportSvg = async () => {
    try {
      const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${graphWidth}" height="${GRAPH_HEIGHT}" viewBox="0 0 ${graphWidth} ${GRAPH_HEIGHT}">\n  <rect width="100%" height="100%" fill="#12070f"/>\n  <line x1="0" y1="${BASELINE_Y}" x2="${graphWidth}" y2="${BASELINE_Y}" stroke="#74515f" stroke-dasharray="4,4"/>\n  <path d="${normalPath}" stroke="#6ee7ff" stroke-width="3" fill="none"/>\n  <path d="${diseasePath}" stroke="#ff6b6b" stroke-width="2.8" fill="none" opacity="${activeDiseases.length ? 0.9 : 0}"/>\n</svg>`;
      const uri = `${FileSystem.cacheDirectory}ecg-waveform.svg`;
      await FileSystem.writeAsStringAsync(uri, svg, { encoding: FileSystem.EncodingType.UTF8 });
      await shareFile(uri, 'image/svg+xml');
    } catch (error) {
      Alert.alert('Export failed', String(error));
    }
  };

  const exportHtml = async () => {
    try {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Interactive ECG Waveform</title><style>body{margin:0;background:#12070f;color:#ffeef4;font-family:Inter,Arial,sans-serif;display:grid;place-items:center;height:100vh}svg{max-width:95vw;height:auto;background:#220d19;border-radius:14px}button{background:#ff4d79;border:none;padding:8px 14px;border-radius:999px;color:white;cursor:pointer} .controls{display:flex;gap:8px;margin-bottom:12px}</style></head><body><div class="controls"><button onclick="toggle()">Toggle pathology overlay</button></div><svg viewBox="0 0 ${graphWidth} ${GRAPH_HEIGHT}"><line x1="0" y1="${BASELINE_Y}" x2="${graphWidth}" y2="${BASELINE_Y}" stroke="#74515f" stroke-dasharray="4 4"/><path id="n" d="${normalPath}" stroke="#6ee7ff" stroke-width="3" fill="none"/><path id="p" d="${diseasePath}" stroke="#ff6b6b" stroke-width="3" fill="none" opacity="0.9"/></svg><script>let on=true;function toggle(){on=!on;document.getElementById('p').style.opacity=on?0.9:0;}</script></body></html>`;
      const uri = `${FileSystem.cacheDirectory}ecg-waveform.html`;
      await FileSystem.writeAsStringAsync(uri, html, { encoding: FileSystem.EncodingType.UTF8 });
      await shareFile(uri, 'text/html');
    } catch (error) {
      Alert.alert('Export failed', String(error));
    }
  };

  const exportPng = async () => {
    try {
      const uri = await viewShotRef.current?.capture?.();
      if (!uri) {
        Alert.alert('Export failed', 'Unable to capture graph');
        return;
      }
      await shareFile(uri, 'image/png');
    } catch (error) {
      Alert.alert('Export failed', String(error));
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <StatusBar style="light" />
      <Text style={styles.title}>
        ECG PQRST Waveform: Normal Physiology and Pathological Variations
      </Text>
      <Text style={styles.caption}>
        Animated educational ECG model comparing normal conduction with classic disease-driven
        morphology changes for clinically relevant interpretation practice.
      </Text>

      <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }} style={styles.card}>
        <View
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            setGraphWidth(Math.max(width, 320));
          }}
          style={styles.graphWrap}
        >
          <Svg width="100%" height={GRAPH_HEIGHT}>
            <Line
              x1={0}
              y1={BASELINE_Y}
              x2={graphWidth}
              y2={BASELINE_Y}
              stroke={THEME.axis}
              strokeDasharray="4 4"
              strokeWidth={1.2}
            />
            <Path d={normalPath} stroke={THEME.normal} strokeWidth={3} fill="none" />
            <Path d={normalPath} stroke={THEME.normal} strokeWidth={9} opacity={0.1} fill="none" />
            <Path
              d={diseasePath}
              stroke={THEME.pathology}
              strokeWidth={3.1}
              fill="none"
              opacity={comparisonMode ? fade : 0.95}
            />
            <Path
              d={diseasePath}
              stroke={THEME.pathology}
              strokeWidth={10}
              fill="none"
              opacity={activeDiseases.length ? 0.08 : 0}
            />

            <SvgText fill={THEME.white} fontSize="12" x={graphWidth * 0.17} y={92}>
              P
            </SvgText>
            <SvgText fill={THEME.white} fontSize="12" x={graphWidth * 0.29} y={84}>
              PR
            </SvgText>
            <SvgText fill={THEME.white} fontSize="12" x={graphWidth * 0.38} y={65}>
              QRS
            </SvgText>
            <SvgText fill={THEME.white} fontSize="12" x={graphWidth * 0.52} y={84}>
              ST
            </SvgText>
            <SvgText fill={THEME.white} fontSize="12" x={graphWidth * 0.66} y={75}>
              T
            </SvgText>
            <SvgText fill={THEME.white} fontSize="12" x={graphWidth * 0.32} y={52}>
              QT
            </SvgText>
            <SvgText fill={THEME.muted} fontSize="11" x={6} y={BASELINE_Y - 8}>
              isoelectric baseline
            </SvgText>
          </Svg>
        </View>
      </ViewShot>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Component physiology (tap to inspect)</Text>
        <View style={styles.chips}>
          {Object.keys(COMPONENT_INFO).map((key) => (
            <Pressable
              key={key}
              onPress={() => setSelectedKey(key)}
              style={[styles.chip, selectedKey === key && styles.chipActive]}
            >
              <Text style={[styles.chipText, selectedKey === key && styles.chipTextActive]}>{key}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>{selectedInfo.title}</Text>
          <Text style={styles.noteLine}>Electrical event: {selectedInfo.electrical}</Text>
          <Text style={styles.noteLine}>Cardiac region: {selectedInfo.heart}</Text>
          <Text style={styles.noteLine}>Dominant ions/channels: {selectedInfo.ions}</Text>
          <Text style={styles.noteLine}>{selectedInfo.duration}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pathology overlays</Text>
        {Object.entries(DISEASES).map(([key, disease]) => (
          <View key={key} style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <Text style={styles.toggleTitle}>{disease.label}</Text>
              <Text style={styles.toggleSubtitle}>Highlighted: {disease.highlight}</Text>
            </View>
            <Switch
              value={activeDiseases.includes(key)}
              onValueChange={() => toggleDisease(key)}
              thumbColor={activeDiseases.includes(key) ? THEME.accent : '#ddd'}
              trackColor={{ false: '#4a2b37', true: '#6f1f38' }}
            />
          </View>
        ))}
        {!!diseaseNotes.length && (
          <View style={styles.noteCardPathology}>
            {diseaseNotes.map((item) => (
              <Text key={item.label} style={styles.noteLine}>
                <Text style={styles.pathologyTag}>{item.label}: </Text>
                {item.why}
              </Text>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.comparisonHeader}>
          <Text style={styles.sectionTitle}>Comparison mode (Normal vs Disease Overlay)</Text>
          <Switch
            value={comparisonMode}
            onValueChange={setComparisonMode}
            thumbColor={comparisonMode ? THEME.accent : '#ddd'}
            trackColor={{ false: '#4a2b37', true: '#6f1f38' }}
          />
        </View>
        {comparisonMode && (
          <View style={styles.fadeRow}>
            <Pressable
              onPress={() => setFade((prev) => Math.max(0, Number((prev - 0.1).toFixed(2))))}
              style={styles.fadeBtn}
            >
              <Text style={styles.fadeBtnText}>Fade -</Text>
            </Pressable>
            <Text style={styles.fadeText}>Disease opacity: {Math.round(fade * 100)}%</Text>
            <Pressable
              onPress={() => setFade((prev) => Math.min(1, Number((prev + 0.1).toFixed(2))))}
              style={styles.fadeBtn}
            >
              <Text style={styles.fadeBtnText}>Fade +</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Export</Text>
        <View style={styles.exportRow}>
          <Pressable onPress={exportPng} style={styles.exportBtn}>
            <Text style={styles.exportBtnText}>Export PNG</Text>
          </Pressable>
          <Pressable onPress={exportSvg} style={styles.exportBtn}>
            <Text style={styles.exportBtnText}>Export SVG</Text>
          </Pressable>
          <Pressable onPress={exportHtml} style={styles.exportBtn}>
            <Text style={styles.exportBtnText}>Export HTML</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 36,
    paddingTop: 56,
    gap: 14,
  },
  title: {
    color: THEME.white,
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 34,
  },
  caption: {
    color: THEME.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 4,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: THEME.card,
    borderColor: '#5f3143',
    borderWidth: 1,
    shadowColor: THEME.accent,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  graphWrap: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  section: {
    backgroundColor: THEME.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#5f3143',
    gap: 10,
  },
  sectionTitle: {
    color: THEME.white,
    fontSize: 15,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#794f5f',
    backgroundColor: '#2a1320',
  },
  chipActive: {
    borderColor: THEME.accent,
    backgroundColor: '#511429',
  },
  chipText: {
    color: THEME.muted,
    fontWeight: '600',
  },
  chipTextActive: {
    color: THEME.white,
  },
  noteCard: {
    backgroundColor: '#1b0b15',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  noteCardPathology: {
    backgroundColor: '#2d0b14',
    borderRadius: 12,
    padding: 12,
    gap: 5,
    borderWidth: 1,
    borderColor: '#97384b',
  },
  noteTitle: {
    color: THEME.accentSoft,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 3,
  },
  noteLine: {
    color: '#ffd8e4',
    fontSize: 13,
    lineHeight: 19,
  },
  pathologyTag: {
    color: '#ff9ead',
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#4f2636',
    paddingBottom: 8,
  },
  toggleTextWrap: {
    flexShrink: 1,
    gap: 2,
  },
  toggleTitle: {
    color: THEME.white,
    fontWeight: '600',
    fontSize: 13,
  },
  toggleSubtitle: {
    color: THEME.muted,
    fontSize: 12,
  },
  comparisonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fadeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  fadeBtn: {
    backgroundColor: '#602437',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#82455a',
  },
  fadeBtnText: {
    color: THEME.white,
    fontWeight: '600',
    fontSize: 12,
  },
  fadeText: {
    color: '#ffd8e4',
    fontSize: 13,
    fontWeight: '600',
  },
  exportRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  exportBtn: {
    backgroundColor: '#6e203a',
    borderColor: '#923857',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  exportBtnText: {
    color: THEME.white,
    fontWeight: '700',
    fontSize: 12,
  },
});
