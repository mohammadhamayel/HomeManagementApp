import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { rtlInput, rtlLabel } from "../theme/rtlStyles";

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const LATIN_DIGITS = "0123456789";

function toLatinDigits(s: string): string {
  return s
    .split("")
    .map((c) => {
      const i = AR_DIGITS.indexOf(c);
      return i >= 0 ? LATIN_DIGITS[i] : c;
    })
    .join("");
}

export function formatDateForDisplay(d: Date): string {
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function parseFlexibleDate(text: string): Date | null {
  const normalized = toLatinDigits(text.trim()).replace(/\s/g, "");
  const parts = normalized.split(/[\/\-\.]/).filter(Boolean);
  if (parts.length !== 3) return null;

  let d: number;
  let m: number;
  let y: number;

  if (parts[0].length === 4) {
    y = Number.parseInt(parts[0], 10);
    m = Number.parseInt(parts[1], 10);
    d = Number.parseInt(parts[2], 10);
  } else {
    d = Number.parseInt(parts[0], 10);
    m = Number.parseInt(parts[1], 10);
    y = Number.parseInt(parts[2], 10);
  }

  if (!Number.isFinite(y) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

type Props = {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  placeholder?: string;
};

export default function DateInputField({
  label,
  value,
  onChange,
  placeholder = "يوم/شهر/سنة",
}: Props) {
  const [text, setText] = useState(() => formatDateForDisplay(value));
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    setText(formatDateForDisplay(value));
  }, [value]);

  const applyParsedOrRevert = () => {
    const parsed = parseFlexibleDate(text);
    if (parsed) {
      onChange(parsed);
      setText(formatDateForDisplay(parsed));
    } else {
      setText(formatDateForDisplay(value));
    }
  };

  const onPickerChange = (
    event: { type?: string },
    date?: Date
  ) => {
    if (Platform.OS === "android") {
      setShowPicker(false);
      if (event.type === "dismissed") {
        return;
      }
    }
    if (date) {
      onChange(date);
      setText(formatDateForDisplay(date));
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, rtlLabel]}>{label}</Text>
      <View style={styles.fieldRow}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setShowPicker(true)}
          accessibilityLabel="فتح التقويم"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.icon}>📅</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.input, rtlInput]}
          value={text}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          onChangeText={(t) => {
            const x = toLatinDigits(t);
            setText(x.replace(/[^0-9/.\-\s]/g, ""));
          }}
          onBlur={applyParsedOrRevert}
          onSubmitEditing={applyParsedOrRevert}
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
        />
      </View>

      {Platform.OS === "android" && showPicker && (
        <DateTimePicker
          value={value}
          mode="date"
          display="default"
          locale="ar"
          onChange={onPickerChange}
        />
      )}

      {Platform.OS === "ios" && (
        <Modal
          visible={showPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowPicker(false)}
        >
          <Pressable
            style={styles.iosOverlay}
            onPress={() => setShowPicker(false)}
          >
            <Pressable style={styles.iosSheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.iosHeader}>
                <TouchableOpacity onPress={() => setShowPicker(false)}>
                  <Text style={styles.iosDone}>تم</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={value}
                mode="date"
                display="spinner"
                locale="ar"
                onChange={(_, d) => {
                  if (d) {
                    onChange(d);
                    setText(formatDateForDisplay(d));
                  }
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: {
    fontSize: 15,
    marginBottom: 6,
    color: "#334155",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#fff",
    minHeight: 48,
    direction: "ltr",
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  iconBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  icon: {
    fontSize: 22,
  },
  iosOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  iosSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  iosHeader: {
    flexDirection: "row-reverse",
    justifyContent: "flex-start",
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  iosDone: {
    fontSize: 17,
    fontWeight: "600",
    color: "#2563eb",
  },
});
