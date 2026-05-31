// Curated network/studio collections for Seerr's Discover tab, mirroring the
// hardcoded lists in Overseerr's own NetworkSlider/StudioSlider. The ids are
// TMDB network/company ids passed straight to /discover/tv/network/:id and
// /discover/movies/studio/:id. Logos are TMDB images rendered through the same
// duotone filter Overseerr uses so they read on a dark background.

export type DiscoverCollectionKind = "network" | "studio" | "genre";

export interface DiscoverCollection {
  id: number;
  name: string;
  // TMDB image path (e.g. "/wwemzKWzjKYJFfCeiB57q3r4Bcm.png"). Build the full
  // URL with getDiscoverLogoUrl().
  logoPath: string;
}

const TMDB_LOGO_DUOTONE_BASE =
  "https://image.tmdb.org/t/p/w780_filter(duotone,ffffff,bababa)";

export function getDiscoverLogoUrl(logoPath: string): string {
  return `${TMDB_LOGO_DUOTONE_BASE}${logoPath}`;
}

// TV networks → /discover/tv/network/:id (results are mediaType "tv").
export const NETWORKS: DiscoverCollection[] = [
  { id: 213, name: "Netflix", logoPath: "/wwemzKWzjKYJFfCeiB57q3r4Bcm.png" },
  { id: 2739, name: "Disney+", logoPath: "/gJ8VX6JSu3ciXHuC2dDGAo2lvwM.png" },
  { id: 1024, name: "Prime Video", logoPath: "/ifhbNuuVnlwYy5oXA5VIb2YR8AZ.png" },
  { id: 2552, name: "Apple TV+", logoPath: "/4KAy34EHvRM25Ih8wb82AuGU7zJ.png" },
  { id: 453, name: "Hulu", logoPath: "/pqUTCleNUiTLAVlelGxUgWn1ELh.png" },
  { id: 49, name: "HBO", logoPath: "/tuomPhY2UtuPTqqFnKMVHvSb724.png" },
  { id: 4353, name: "Discovery+", logoPath: "/1D1bS3Dyw4ScYnFWTlBOvJXC3nb.png" },
  { id: 2, name: "ABC", logoPath: "/ndAvF4JLsliGreX87jAc9GdjmJY.png" },
  { id: 19, name: "FOX", logoPath: "/1DSpHrWyOORkL9N2QHX7Adt31mQ.png" },
  { id: 359, name: "Cinemax", logoPath: "/6mSHSquNpfLgDdv6VnOOvC5Uz2h.png" },
  { id: 174, name: "AMC", logoPath: "/pmvRmATOCaDykE6JrVoeYxlFHw3.png" },
  { id: 67, name: "Showtime", logoPath: "/Allse9kbjiP6ExaQrnSpIhkurEi.png" },
  { id: 318, name: "Starz", logoPath: "/8GJjw3HHsAJYwIWKIPBPfqMxlEa.png" },
  { id: 71, name: "The CW", logoPath: "/ge9hzeaU7nMtQ4PjkFlc68dGAJ9.png" },
  { id: 6, name: "NBC", logoPath: "/o3OedEP0f9mfZr33jz2BfXOUK5.png" },
  { id: 16, name: "CBS", logoPath: "/nm8d7P7MJNiBLdgIzUK0gkuEA4r.png" },
  { id: 4330, name: "Paramount+", logoPath: "/fi83B1oztoS47xxcemFdPMhIzK.png" },
  { id: 4, name: "BBC One", logoPath: "/mVn7xESaTNmjBUyUtGNvDQd3CT1.png" },
  { id: 56, name: "Cartoon Network", logoPath: "/c5OC6oVCg6QP4eqzW6XIq17CQjI.png" },
  { id: 80, name: "Adult Swim", logoPath: "/9AKyspxVzywuaMuZ1Bvilu8sXly.png" },
  { id: 13, name: "Nickelodeon", logoPath: "/ikZXxg6GnwpzqiZbRPhJGaZapqB.png" },
  { id: 3353, name: "Peacock", logoPath: "/gIAcGTjKKr0KOHL5s4O36roJ8p7.png" },
];

// Movie studios → /discover/movies/studio/:id (results are mediaType "movie").
export const STUDIOS: DiscoverCollection[] = [
  { id: 2, name: "Disney", logoPath: "/wdrCwmRnLFJhEoH8GSfymY85KHT.png" },
  { id: 127928, name: "20th Century Studios", logoPath: "/h0rjX5vjW5r8yEnUBStFarjcLT4.png" },
  { id: 34, name: "Sony Pictures", logoPath: "/GagSvqWlyPdkFHMfQ3pNq6ix9P.png" },
  { id: 174, name: "Warner Bros. Pictures", logoPath: "/ky0xOc5OrhzkZ1N6KyUxacfQsCk.png" },
  { id: 33, name: "Universal", logoPath: "/8lvHyhjr8oUKOOy2dKXoALWKdp0.png" },
  { id: 4, name: "Paramount", logoPath: "/fycMZt242LVjagMByZOLUGbCvv3.png" },
  { id: 3, name: "Pixar", logoPath: "/1TjvGVDMYsj6JBxOAkUHpPEwLf7.png" },
  { id: 521, name: "Dreamworks", logoPath: "/kP7t6RwGz2AvvTkvnI1uteEwHet.png" },
  { id: 420, name: "Marvel Studios", logoPath: "/hUzeosd33nzE5MCNsZxCGEKTXaQ.png" },
  { id: 9993, name: "DC", logoPath: "/2Tc1P3Ac8M479naPp1kYT3izLS5.png" },
  { id: 41077, name: "A24", logoPath: "/1ZXsGaFPgrgS6ZZGS37AqD5uU12.png" },
];
