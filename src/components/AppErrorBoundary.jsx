import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // Keep technical details in the developer console only. The recovery UI
    // never serializes engagement data, provider configuration, or error stacks.
    console.error("KOSIF render boundary", error, info);
  }

  recover = () => {
    try {
      window.location.reload();
    } catch {
      this.setState({ failed: false });
    }
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-fatal-recovery" role="alert" dir="rtl">
        <section>
          <span className="app-fatal-icon" aria-hidden="true"><AlertTriangle size={28} /></span>
          <div>
            <p className="eyebrow">استعادة آمنة</p>
            <h1>تعذر عرض هذه الشاشة</h1>
            <p>لم يتم حذف بياناتك. أعد تحميل مساحة العمل للعودة إلى آخر حالة محفوظة.</p>
          </div>
          <button type="button" className="button button-gold" onClick={this.recover}>
            <RotateCcw size={17} aria-hidden="true" /> إعادة تحميل KOSIF
          </button>
        </section>
      </main>
    );
  }
}
