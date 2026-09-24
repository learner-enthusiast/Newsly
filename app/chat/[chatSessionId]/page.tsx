import { ChatWorkspace } from "@/components/chat/ChatWorkspace";

type PageProps = {
  params: Promise<{ chatSessionId: string }>;
};

export default async function ChatSessionPage({ params }: PageProps) {
  const { chatSessionId } = await params;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <ChatWorkspace chatSessionId={chatSessionId} />
    </div>
  );
}
