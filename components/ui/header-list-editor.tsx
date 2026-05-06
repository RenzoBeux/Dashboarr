import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { TextInput } from "@/components/ui/text-input";

interface Row {
  id: string;
  name: string;
  value: string;
}

interface HeaderListEditorProps {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  helperText?: string;
}

// RFC 7230 token chars — same set the server-side validator allows.
const HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
const MAX_HEADERS = 32;

function rowsToRecord(rows: Row[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    out[name] = row.value;
  }
  return out;
}

let rowIdSeq = 0;
const nextRowId = () => `hdr-${++rowIdSeq}`;

function recordToRows(value: Record<string, string>): Row[] {
  return Object.entries(value).map(([name, val]) => ({
    id: nextRowId(),
    name,
    value: val,
  }));
}

export function HeaderListEditor({
  value,
  onChange,
  helperText,
}: HeaderListEditorProps) {
  // Mirror the incoming map into row objects with stable ids so each input
  // keeps focus across keystrokes. The lazy initializer seeds once from props;
  // after that the editor owns its row order and only emits up via onChange.
  const [rows, setRows] = useState<Row[]>(() => recordToRows(value));

  const commit = (next: Row[]) => {
    setRows(next);
    onChange(rowsToRecord(next));
  };

  const handleAdd = () => {
    if (rows.length >= MAX_HEADERS) return;
    commit([...rows, { id: nextRowId(), name: "", value: "" }]);
  };

  const handleRemove = (id: string) => {
    commit(rows.filter((r) => r.id !== id));
  };

  const handleChangeName = (id: string, name: string) => {
    commit(rows.map((r) => (r.id === id ? { ...r, name } : r)));
  };

  const handleChangeValue = (id: string, val: string) => {
    commit(rows.map((r) => (r.id === id ? { ...r, value: val } : r)));
  };

  return (
    <View className="gap-3">
      {rows.length === 0 ? (
        <Text className="text-zinc-500 text-xs">
          No headers yet. Tap "Add header" to start.
        </Text>
      ) : (
        rows.map((row) => {
          const trimmed = row.name.trim();
          const nameInvalid = trimmed.length > 0 && !HEADER_NAME_RE.test(trimmed);
          return (
            <View key={row.id} className="gap-2">
              <View className="flex-row items-end gap-2">
                <View className="flex-1">
                  <TextInput
                    label="Header"
                    placeholder="X-Custom-Header"
                    value={row.name}
                    onChangeText={(t) => handleChangeName(row.id, t)}
                    error={nameInvalid ? "Invalid header name" : undefined}
                  />
                </View>
                <Pressable
                  onPress={() => handleRemove(row.id)}
                  className="bg-surface-light rounded-xl p-3 mb-0.5 active:opacity-70"
                  accessibilityLabel="Remove header"
                >
                  <Icon icon={Trash2} size={18} color="#a1a1aa" />
                </Pressable>
              </View>
              <TextInput
                label="Value"
                placeholder="Bearer ..."
                value={row.value}
                onChangeText={(t) => handleChangeValue(row.id, t)}
                secureTextEntry
              />
            </View>
          );
        })
      )}

      <Pressable
        onPress={handleAdd}
        disabled={rows.length >= MAX_HEADERS}
        className={`flex-row items-center justify-center gap-2 bg-surface-light rounded-xl py-3 ${
          rows.length >= MAX_HEADERS ? "opacity-50" : "active:opacity-70"
        }`}
      >
        <Icon icon={Plus} size={16} color="#a1a1aa" />
        <Text className="text-zinc-300 text-sm font-medium">Add header</Text>
      </Pressable>

      {helperText && (
        <Text className="text-zinc-500 text-xs">{helperText}</Text>
      )}
    </View>
  );
}
