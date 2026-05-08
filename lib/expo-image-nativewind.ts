// Side-effect: tell NativeWind to translate `className` into `style` on
// expo-image's <Image>. NativeWind v4 only auto-wires this for the built-in
// React Native components — third-party components need an explicit cssInterop
// registration or `className="..."` is silently dropped at render time.
//
// Without this, every <Image className="w-full aspect-[2/3]..."/> in tabs and
// detail screens renders with no dimensions or background, producing blank
// posters. The dashboard widgets that pass `style={{...}}` directly are
// unaffected.
import { Image } from "expo-image";
import { cssInterop } from "nativewind";

cssInterop(Image, { className: "style" });
