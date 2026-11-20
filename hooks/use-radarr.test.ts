jest.mock("@tanstack/react-query", () => ({
  useMutation: jest.fn(),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("@/services/radarr-api", () => ({ deleteMovie: jest.fn(async () => {}) }));
jest.mock("@/services/overseerr-api", () => ({
  getMovieDetails: jest.fn(async () => ({ mediaInfo: { id: 42 } })),
  deleteMedia: jest.fn(),
}));
jest.mock("@/hooks/use-instance-target", () => ({
  useInstanceTarget: (_kind: string, instanceId: string) => ({ instanceId, enabled: true }),
}));
jest.mock("@/hooks/use-arr-tags", () => ({}));
jest.mock("@/lib/arr-queue-query", () => ({}));
jest.mock("@/components/ui/toast", () => ({}));

import { useMutation } from "@tanstack/react-query";
import { deleteMovie } from "@/services/radarr-api";
import { deleteMedia, getMovieDetails } from "@/services/overseerr-api";
import { useDeleteMovie } from "./use-radarr";

it("deletes from the selected Radarr without editing Seerr's media record", async () => {
  useDeleteMovie("cabin-radarr");
  const { mutationFn } = jest.mocked(useMutation).mock.calls[0][0] as {
    mutationFn: (input: { id: number; deleteFiles: boolean; addExclusion: boolean; tmdbId: number }) => Promise<void>;
  };
  await mutationFn({ id: 7, deleteFiles: true, addExclusion: true, tmdbId: 123 });

  expect(deleteMovie).toHaveBeenCalledWith(
    7,
    { deleteFiles: true, addExclusion: true },
    "cabin-radarr",
  );
  expect(getMovieDetails).not.toHaveBeenCalled();
  expect(deleteMedia).not.toHaveBeenCalled();
});
