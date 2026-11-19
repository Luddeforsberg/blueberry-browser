-- A look's palette ids are the berries' names now: blueberry, lingon, cloudberry, gooseberry, raspberry and currant, for
-- what were kingfisher, robin, canary, parakeet, flamingo and jackdaw. Both are taken, because the rows already here and
-- apps that haven't updated have the old ids, and every app since reads either. Apps keep sending the old ids until this
-- has run everywhere (`serverPalette` in src/shared/mascots.ts). Run it once in the SQL editor, after the others.

alter table public.mascots drop constraint look_shape;
alter table public.mascots add constraint look_shape check (
  palette in (
    'blueberry', 'lingon', 'cloudberry', 'gooseberry', 'raspberry', 'currant',
    'kingfisher', 'robin', 'canary', 'parakeet', 'flamingo', 'jackdaw'
  )
  and accessory in ('none', 'crown', 'cap', 'glasses', 'headphones', 'bow')
);

alter table public.cloud_flock drop constraint look_shape;
alter table public.cloud_flock add constraint look_shape check (
  palette in (
    'blueberry', 'lingon', 'cloudberry', 'gooseberry', 'raspberry', 'currant',
    'kingfisher', 'robin', 'canary', 'parakeet', 'flamingo', 'jackdaw'
  )
  and accessory in ('none', 'crown', 'cap', 'glasses', 'headphones', 'bow')
);
