import type { TextStyle, ViewStyle } from "react-native";

/** Text fields: Arabic typing and placeholders align from the right */
export const rtlInput: TextStyle = {
  textAlign: "right",
  writingDirection: "rtl",
};

export const rtlLabel: TextStyle = {
  textAlign: "right",
  writingDirection: "rtl",
};

export const rtlRow: ViewStyle = {
  flexDirection: "row-reverse",
  alignItems: "center",
};
