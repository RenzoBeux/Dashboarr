import { useRef, useState } from "react";
import { Keyboard, Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { TextInput } from "@/components/ui/text-input";
import { useCreateArrTag } from "@/hooks/use-arr-tags";
import { HttpError, getHttpErrorMessage } from "@/lib/http-client";
import {
  addTagId,
  resolveTagInput,
  toggleTagId,
  validationFailureMessage,
} from "@/lib/arr-tag-input";
import type { ArrTagService } from "@/services/arr-tags";
import type { ArrTag } from "@/lib/types";

interface ArrTagPickerProps {
  service: ArrTagService;
  /** The instance the tags live on. Omit to follow the active instance. */
  instanceId?: string;
  /** The instance's tag list. undefined (still loading, or failed) hides the picker. */
  tags: ArrTag[] | undefined;
  selected: number[];
  onChange: (ids: number[]) => void;
  className?: string;
}

function createErrorMessage(err: unknown): string {
  return (
    getHttpErrorMessage(err) ??
    (err instanceof HttpError ? validationFailureMessage(err.body) : undefined) ??
    "Couldn't create tag"
  );
}

// Radarr/Sonarr/Lidarr tag chips plus a "New tag" chip that opens an inline
// input (issue #485), shared by the add sheet and the Movie/Series Options
// sheets. A new tag is created on the server right away, as the *arr web UI's
// own tag input does, and selected; closing the sheet without saving leaves it
// on the server unassigned, which is upstream's behavior too.
//
// Every host is a pageSheet Modal: a toast would render behind it, so errors
// stay inline, and the host must use the pageSheet keyboard pattern
// (KeyboardAwareScrollView, see CLAUDE.md) so the input is never covered.
export function ArrTagPicker({
  service,
  instanceId,
  tags,
  selected,
  onChange,
  className = "",
}: ArrTagPickerProps) {
  const createTag = useCreateArrTag(service, instanceId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>();

  // The create POST resolves a round-trip later. Read the selection through a
  // ref then, so a chip toggled while it was in flight isn't dropped when the
  // new id is appended.
  const latest = useRef({ selected, onChange });
  latest.current = { selected, onChange };

  if (!tags) return null;

  const select = (id: number) =>
    latest.current.onChange(addTagId(latest.current.selected, id));

  const closeEditor = () => {
    // Close the keyboard with the input instead of relying on the unmount.
    Keyboard.dismiss();
    setEditing(false);
    setDraft("");
    setError(undefined);
  };

  const submit = () => {
    if (createTag.isPending) return;
    // The server only dedupes an exact-case match, so an existing tag is
    // reused here instead of POSTing a near-duplicate.
    const input = resolveTagInput(tags, draft);
    if (input.kind === "invalid") {
      setError(input.error);
      return;
    }
    if (input.kind === "existing") {
      select(input.tag.id);
      closeEditor();
      return;
    }
    createTag.mutate(input.label, {
      onSuccess: (tag) => {
        select(tag.id);
        closeEditor();
      },
      onError: (err) => setError(createErrorMessage(err)),
    });
  };

  return (
    <View className={className}>
      <Text className="text-zinc-400 text-sm mb-2">Tags</Text>
      <View className="flex-row flex-wrap gap-2">
        {tags.map((tag) => (
          <FilterChip
            key={tag.id}
            label={tag.label}
            selected={selected.includes(tag.id)}
            onPress={() => onChange(toggleTagId(selected, tag.id))}
          />
        ))}
        {!editing ? (
          <FilterChip
            label="New tag"
            selected={false}
            onPress={() => setEditing(true)}
            icon={<Icon icon={Plus} size={14} color="#a1a1aa" />}
          />
        ) : null}
      </View>

      {editing ? (
        <View className="mt-3">
          <TextInput
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              if (error) setError(undefined);
            }}
            placeholder="new-tag"
            accessibilityLabel="New tag name"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={submit}
            error={error}
          />
          <View className="flex-row justify-end gap-2 mt-2">
            <Button
              label="Cancel"
              variant="ghost"
              onPress={closeEditor}
              disabled={createTag.isPending}
            />
            <Button
              label="Add Tag"
              onPress={submit}
              disabled={draft.trim().length === 0}
              loading={createTag.isPending}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
