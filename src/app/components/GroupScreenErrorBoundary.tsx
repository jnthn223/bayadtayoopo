import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import { deleteOfflineExpenseDraftsForGroup } from "./offlineExpenseDrafts";

interface Props {
  children: ReactNode;
  groupId: string;
  userId: string;
  onBack: () => void;
}

interface State {
  error?: Error;
}

export class GroupScreenErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unable to render group screen", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col bg-background px-5 pb-8 pt-14">
        <button type="button" onClick={this.props.onBack} className="flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-sm" aria-label="Back"><ArrowLeft size={19} /></button>
        <div className="m-auto w-full max-w-md rounded-3xl border border-border bg-card p-6 text-center shadow-xl">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-800"><AlertTriangle size={22} /></span>
          <h1 className="mt-4 text-lg font-semibold text-foreground">Couldn’t open this person view</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">The shared records are still safe. A local draft or temporary browser state could not be displayed.</p>
          <p className="mt-3 break-words rounded-xl bg-muted px-3 py-2 text-left text-[11px] text-muted-foreground">{this.state.error.message || "Unknown display error"}</p>
          <div className="mt-5 space-y-2">
            <button type="button" onClick={() => window.location.reload()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"><RefreshCw size={15} /> Reload app</button>
            <button type="button" onClick={() => {
              deleteOfflineExpenseDraftsForGroup(this.props.userId, this.props.groupId);
              window.location.reload();
            }} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-semibold text-foreground"><Trash2 size={15} /> Remove local drafts and retry</button>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Removing local drafts does not delete submitted expenses or payment history.</p>
        </div>
      </div>
    );
  }
}
