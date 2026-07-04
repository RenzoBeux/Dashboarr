// Custom entry point. Registers the app root (expo-router) AND the Android
// widget headless task, so a cold-started headless process (app killed, OS
// updating the widget) has the task handler before Android dispatches to it.
import "expo-router/entry";
import { registerWidgetTaskHandler } from "react-native-android-widget";
import { widgetTaskHandler } from "./widgets/widget-task-handler";

registerWidgetTaskHandler(widgetTaskHandler);
