import { render } from "solid-js/web";
import { Router } from "@solidjs/router";
import { Layout } from "./components/Layout";
import { lazy } from "solid-js";
import "./lib/settings";

const Feed = lazy(() => import("./views/Feed"));
const Profile = lazy(() => import("./views/Profile"));
const Chat = lazy(() => import("./views/Chat"));
const Groups = lazy(() => import("./views/Groups"));
const Messages = lazy(() => import("./views/Messages"));
const Streams = lazy(() => import("./views/Streams"));
const Settings = lazy(() => import("./views/Settings"));
const Wallet = lazy(() => import("./views/Wallet"));
const Thread = lazy(() => import("./views/Thread"));

const routes = [
  { path: "/", component: Feed },
  { path: "/relay/:relayHost", component: Feed },
  { path: "/thread/:noteId", component: Thread },
  { path: "/profile/:pubkey", component: Profile },
  { path: "/chat", component: Chat },
  { path: "/chat/:channelId", component: Chat },
  { path: "/groups", component: Groups },
  { path: "/groups/:groupCode", component: Groups },
  { path: "/messages", component: Messages },
  { path: "/messages/:pubkey", component: Messages },
  { path: "/streams", component: Streams },
  { path: "/streams/:naddr", component: Streams },
  { path: "/wallet", component: Wallet },
  { path: "/settings", component: Settings },
];

render(
  () => <Router root={Layout}>{routes}</Router>,
  document.getElementById("root")
);
