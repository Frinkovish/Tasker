import { Badge } from "@/components/ui/badge";
import { TASK_PRIORITY_LABELS, type TaskPriority } from "@/lib/domain/task";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  critical: "border-destructive/40 text-destructive",
  high: "border-orange-600/40 text-orange-700 dark:text-orange-400",
  medium: "text-muted-foreground",
  low: "text-muted-foreground",
};

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge variant="outline" className={cn(PRIORITY_STYLES[priority])}>
      {TASK_PRIORITY_LABELS[priority]}
    </Badge>
  );
}
