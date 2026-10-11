import type { ReactNode } from "react";
import { StepNav } from "./step-nav";

export default async function PostLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <StepNav id={decodeURIComponent(id)} />
      {children}
    </div>
  );
}
