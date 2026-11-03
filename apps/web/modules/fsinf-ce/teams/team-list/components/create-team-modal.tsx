"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createTeamAction } from "@/modules/fsinf-ce/teams/actions";
import { useTeamAction } from "@/modules/fsinf-ce/teams/lib/use-team-action";
import { ZTeamName } from "@/modules/fsinf-ce/teams/team-list/types/team";
import { Button } from "@/modules/ui/components/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/modules/ui/components/dialog";
import { Input } from "@/modules/ui/components/input";
import { Label } from "@/modules/ui/components/label";

interface CreateTeamModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  organizationId: string;
}

/** FSINF CE: dialog to create an (empty) team. Members and workspaces are added via "Manage team". */
export const CreateTeamModal = ({ open, setOpen, organizationId }: Readonly<CreateTeamModalProps>) => {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const { run, isPending } = useTeamAction();

  const isValid = ZTeamName.safeParse(name).success;

  const handleClose = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setName("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid) return;
    const ok = await run(
      () => createTeamAction({ organizationId, name }),
      t("workspace.settings.teams.team_created_successfully")
    );
    if (ok) handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("workspace.settings.teams.create_new_team")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogBody className="space-y-2">
            <Label htmlFor="fsinf-team-name">{t("workspace.settings.teams.team_name")}</Label>
            <Input
              id="fsinf-team-name"
              value={name}
              maxLength={100}
              autoFocus
              placeholder={t("workspace.settings.teams.enter_team_name")}
              onChange={(event) => setName(event.target.value)}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => handleClose(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={isPending} disabled={!isValid}>
              {t("workspace.settings.teams.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
