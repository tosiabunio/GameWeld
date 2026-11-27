-- Ranks are fractional index keys, which compare bytewise: "Zz" comes before "a0". The rank
-- columns of the first schema took the database's default collation, so on a database made with
-- a language's collation (en_US.utf8 and the like) ORDER BY, min, and max put them in another
-- order than the application computes with, and an item dragged to the top of a lane listed
-- last. The later rank columns (my_task_ranks, task_checklist_items) are "C" already. The
-- indexes on these columns are rebuilt with them.
ALTER TABLE backlog_items   ALTER COLUMN rank TYPE text COLLATE "C";
ALTER TABLE board_columns   ALTER COLUMN rank TYPE text COLLATE "C";
ALTER TABLE task_placements ALTER COLUMN rank TYPE text COLLATE "C";
