import { PRESET_VALUES } from "@armin/core/scheduling-presets";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Text style={styles.title}>Armin</Text>
      <Text style={styles.description}>
        Build understanding, one card at a time.
      </Text>
      <Text style={styles.goal}>
        Daily goal: {PRESET_VALUES.balanced.newReviewUnitsPerDay} new review
        units
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fafaf9",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: "600",
    color: "#1c1917",
  },
  description: {
    fontSize: 16,
    textAlign: "center",
    color: "#57534e",
  },
  goal: {
    fontSize: 14,
    textAlign: "center",
    color: "#57534e",
  },
});
