"use client";

import { SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";

import { NativeSelect } from "@/components/common/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from "@/lib/domain/task";
import {
  DEADLINE_FILTERS,
  DEADLINE_FILTER_LABELS,
  buildTasksHref,
  hasActiveFilters,
  type TaskFilters,
} from "@/lib/tasks/filters";
import { cn } from "@/lib/utils";
import { ALL_WORKSPACES } from "@/lib/workspaces/scope";

const SEARCH_DELAY_MS = 250;

interface Option {
  id: string;
  name: string;
}

interface TaskFilterBarProps {
  filters: TaskFilters;
  scope: string;
  workspaces: readonly Option[];
  stakeholders: readonly Option[];
  projects: readonly Option[];
}

const EMPTY_FILTERS: TaskFilters = {
  query: "",
  status: "active",
  priority: null,
  stakeholderId: null,
  projectId: null,
  deadline: null,
};

export function TaskFilterBar({
  filters,
  scope,
  workspaces,
  stakeholders,
  projects,
}: TaskFilterBarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // The URL is the source of truth; this shows a choice until the page catches up.
  const [shown, setShown] = useOptimistic({ filters, scope });
  const [query, setQuery] = useState(filters.query);
  const [isOpen, setIsOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  const apply = (nextFilters: TaskFilters, nextScope: string) => {
    clearTimeout(searchTimer.current);
    startTransition(() => {
      setShown({ filters: nextFilters, scope: nextScope });
      router.replace(
        buildTasksHref(
          nextFilters,
          nextScope === ALL_WORKSPACES ? null : nextScope,
        ),
        { scroll: false },
      );
    });
  };

  const update = (change: Partial<TaskFilters>) =>
    apply({ ...shown.filters, query: query.trim(), ...change }, shown.scope);

  const isFiltered = hasActiveFilters(shown.filters);

  return (
    <div className="space-y-3" aria-busy={isPending}>
      <div className="flex gap-2">
        <Input
          type="search"
          aria-label="Search tasks"
          placeholder="Search tasks"
          value={query}
          onChange={(event) => {
            const text = event.target.value;
            setQuery(text);
            clearTimeout(searchTimer.current);
            searchTimer.current = setTimeout(
              () => update({ query: text.trim() }),
              SEARCH_DELAY_MS,
            );
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="md:hidden"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        >
          <SlidersHorizontal aria-hidden />
          Filters
        </Button>
      </div>

      <div
        className={cn(
          "grid-cols-2 gap-2 md:grid md:grid-cols-3 lg:grid-cols-6",
          isOpen ? "grid" : "hidden",
        )}
      >
        <NativeSelect
          aria-label="Filter by workspace"
          value={shown.scope}
          onChange={(event) =>
            // Stakeholders and projects belong to a workspace, so they reset too.
            apply(
              {
                ...shown.filters,
                query: query.trim(),
                stakeholderId: null,
                projectId: null,
              },
              event.target.value,
            )
          }
        >
          <option value={ALL_WORKSPACES}>All workspaces</option>
          {workspaces.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filter by status"
          value={shown.filters.status}
          onChange={(event) =>
            update({ status: event.target.value as TaskFilters["status"] })
          }
        >
          <option value="active">Active</option>
          <option value="all">All statuses</option>
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {TASK_STATUS_LABELS[status]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filter by priority"
          value={shown.filters.priority ?? ""}
          onChange={(event) =>
            update({
              priority: (event.target.value || null) as TaskFilters["priority"],
            })
          }
        >
          <option value="">Any priority</option>
          {TASK_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {TASK_PRIORITY_LABELS[priority]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filter by stakeholder"
          value={shown.filters.stakeholderId ?? ""}
          onChange={(event) =>
            update({ stakeholderId: event.target.value || null })
          }
        >
          <option value="">Any stakeholder</option>
          {stakeholders.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filter by project"
          value={shown.filters.projectId ?? ""}
          onChange={(event) => update({ projectId: event.target.value || null })}
        >
          <option value="">Any project</option>
          {projects.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filter by deadline"
          value={shown.filters.deadline ?? ""}
          onChange={(event) =>
            update({
              deadline: (event.target.value || null) as TaskFilters["deadline"],
            })
          }
        >
          <option value="">Any deadline</option>
          {DEADLINE_FILTERS.map((deadline) => (
            <option key={deadline} value={deadline}>
              {DEADLINE_FILTER_LABELS[deadline]}
            </option>
          ))}
        </NativeSelect>
        {isFiltered && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setQuery("");
              apply(EMPTY_FILTERS, shown.scope);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
