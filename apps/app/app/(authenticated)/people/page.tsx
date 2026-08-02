import { auth } from "@repo/auth/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listPeople } from "@/app/actions/knowledge/list-people";
import { Header } from "../components/header";
import { PersonRow } from "./components/person-row";

export const metadata: Metadata = {
  description: "People the brain knows about — and the right to be forgotten.",
  title: "People",
};

const PeoplePage = async () => {
  const { orgId } = await auth();
  if (!orgId) {
    notFound();
  }
  const people = await listPeople();

  return (
    <>
      <Header page="People" pages={["Knowledge"]} />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">People</CardTitle>
            <CardDescription>
              Erasing a person removes their facts, redacts their identifiers
              from sources and the audit trail, and deletes orphaned audio —
              GDPR Art. 17, one click, irreversible.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {people.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No people yet — they appear here once reviews confirm person
                entities.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {people.map((person) => (
                  <PersonRow key={person.id} person={person} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default PeoplePage;
