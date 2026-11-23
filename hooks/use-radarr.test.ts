const mockInvalidateQueries = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useMutation: jest.fn(),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));
jest.mock("@/services/radarr-api", () => ({ deleteMovie: jest.fn(async () => {}) }));
jest.mock("@/hooks/use-instance-target", () => ({
  useInstanceTarget: (_kind: string, instanceId: string) => ({ instanceId, enabled: true }),
}));
jest.mock("@/hooks/use-arr-tags", () => ({}));
jest.mock("@/lib/arr-queue-query", () => ({}));
jest.mock("@/components/ui/toast", () => ({}));

import { useMutation } from "@tanstack/react-query";
import { deleteMovie } from "@/services/radarr-api";
import { useDeleteMovie } from "./use-radarr";

type DeleteInput = Parameters<typeof deleteMovie>[1] & { id: number };

function deleteOptions() {
  useDeleteMovie("cabin-radarr");
  return jest.mocked(useMutation).mock.calls.at(-1)![0] as unknown as {
    mutationFn: (input: DeleteInput) => Promise<void>;
    onSuccess: (data: void, input: DeleteInput) => void;
  };
}

it("deletes from the selected Radarr only", async () => {
  await deleteOptions().mutationFn({ id: 7, deleteFiles: true, addExclusion: true });
  expect(deleteMovie).toHaveBeenCalledWith(
    7,
    { deleteFiles: true, addExclusion: true },
    "cabin-radarr",
  );
});

it("refreshes every list the deleted movie can appear in", () => {
  mockInvalidateQueries.mockClear();
  deleteOptions().onSuccess(undefined, { id: 7 });
  const keys = mockInvalidateQueries.mock.calls.map(([filters]) => filters.queryKey);
  for (const list of ["movies", "calendar", "wanted", "queue"]) {
    expect(keys).toContainEqual(["radarr", "cabin-radarr", list]);
  }
  expect(mockInvalidateQueries).toHaveBeenCalledWith({
    queryKey: ["radarr", "cabin-radarr", "movie", 7],
    refetchType: "none",
  });
});
