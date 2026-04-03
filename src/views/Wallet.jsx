import { Switch, Match, createMemo } from "solid-js";
import { getCurrentPage } from "../lib/wallet";
import {
  WalletHome, ModeSelection, NwcSetup, SparkSetup, SparkBackup,
  SendInput, SendConfirm, Sending, SendResult,
  ReceiveAmount, ReceiveInvoice, ReceiveSuccess,
  Transactions, WalletSettings, RestoreFromRelay,
} from "../components/WalletPages";

export default function Wallet() {
  const page = createMemo(() => getCurrentPage());

  return (
    <div style={styles.container}>
      <Switch fallback={<WalletHome />}>
        <Match when={page() === "home"}><WalletHome /></Match>
        <Match when={page() === "mode-selection"}><ModeSelection /></Match>
        <Match when={page() === "nwc-setup"}><NwcSetup /></Match>
        <Match when={page() === "spark-setup"}><SparkSetup /></Match>
        <Match when={page() === "spark-backup"}><SparkBackup /></Match>
        <Match when={page() === "send-input"}><SendInput /></Match>
        <Match when={page() === "send-confirm"}><SendConfirm /></Match>
        <Match when={page() === "sending"}><Sending /></Match>
        <Match when={page() === "send-result"}><SendResult /></Match>
        <Match when={page() === "receive-amount"}><ReceiveAmount /></Match>
        <Match when={page() === "receive-invoice"}><ReceiveInvoice /></Match>
        <Match when={page() === "receive-success"}><ReceiveSuccess /></Match>
        <Match when={page() === "transactions"}><Transactions /></Match>
        <Match when={page() === "settings"}><WalletSettings /></Match>
        <Match when={page() === "restore-from-relay"}><RestoreFromRelay /></Match>
      </Switch>
    </div>
  );
}

const styles = {
  container: {
    "max-width": "600px",
    margin: "0 auto",
    "min-height": "100vh",
  },
};
