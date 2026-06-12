-- Rows cached as 'drop' predate the proxy-descriptor classify prompt (which now
-- maps acidity/body descriptors to citrus/nut/sugar instead of "other"). Deleting
-- them makes those notes eligible for one re-classification under the new prompt.
delete from public.learned_notes where family = 'drop';
