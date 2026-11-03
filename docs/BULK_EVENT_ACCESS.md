# Bulk people actions

In a program's **People & passes** screen:

1. Select people using the row checkboxes, or choose **Select all matching** to select people matching the current search and filters.
2. Choose **Edit event access**.
3. Select one or more events and choose the audience role for each event, such as **Participants**.
4. Choose **Apply and save**. Keep the page open until saving finishes.

Existing access to other events and each person's program role are preserved. Selected events receive the chosen role; existing registrations remain registered. Blocked people can be selected for deletion; **Edit event access** is disabled while blocked people are selected. Removed people are excluded.

Selections remain when filters change; the screen reports any selected people outside the current filters, and the drawer lists everyone selected. Switching programs clears the selection.

If some saves fail, the drawer lists those people and their errors. Successful people are deselected; **Retry selected** retries only the remaining selection.

## Delete selected people

1. Select people, then choose **Delete selected** beside **Edit event access**.
2. Review the program, names, and total in the confirmation drawer, including any people selected outside the current filters.
3. Choose **Delete N people** to remove those people from the program roster and revoke their Sang app access and QR passes. Records are retained for history, matching the existing per-person removal action.

Cancel closes the confirmation without making changes. Deletion shows progress and retains only unsuccessful people for retry. The confirmed selection is fixed for that deletion run, so live roster changes do not add people to the operation. Blocked people can also be deleted. Already removed or missing records are treated as completed without another removal request.

## Implementation and verification

- Bulk controls require `people.import`. Each save uses the existing `updateProgramPersonAccess` callable, which enforces organization/program/event scope and synchronizes the existing Sang access mirrors.
- The client reads each person's latest server record before constructing the update and runs at most four saves concurrently. Saves are independent per person, not one atomic update for the entire selection.
- Bulk deletion uses the existing `removeProgramPersonAccess` callable and the same permission gate and request limit. The client checks each person's current organization/program before requesting removal; the callable enforces permissions and updates the access/pass lifecycle and mirrors.
- No new callable, collection, rule, index, or mobile contract is introduced.
- Run `npm run lint`, `npm run build`, and `node --test tests/bulkEventAccess.test.mjs` from `web/` (the tests require Node with built-in TypeScript support).
