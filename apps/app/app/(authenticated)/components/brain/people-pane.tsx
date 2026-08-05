import type { PersonListItem } from "@/app/actions/knowledge/list-people";
import { PersonRow } from "./person-row";

export const PeoplePane = ({ people }: { people: PersonListItem[] }) => (
  <section className="flex flex-col gap-3">
    <div className="flex flex-col gap-1">
      <h2 className="font-medium text-sm">People the brain knows</h2>
      <p className="text-muted-foreground text-xs">
        Erasing a person removes their facts, redacts their identifiers from
        sources and the audit trail, and deletes orphaned audio — GDPR Art. 17,
        one click, irreversible.
      </p>
    </div>
    {people.length === 0 ? (
      <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-sm">
        No people yet — they appear here once reviews confirm person entities.
      </p>
    ) : (
      <div className="flex flex-col gap-2">
        {people.map((person) => (
          <PersonRow key={person.id} person={person} />
        ))}
      </div>
    )}
  </section>
);
