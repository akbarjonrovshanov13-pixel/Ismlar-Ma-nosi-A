import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const videos = pgTable('videos', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  userEmail: text('user_email'),
  topic: text('topic').notNull(),
  fullScript: text('full_script').notNull(),
  scriptJson: text('script_json'),
  hashtagsJson: text('hashtags_json'),
  imageUrlsJson: text('image_urls_json'),
  captionStyle: text('caption_style'),
  voice: text('voice'),
  createdAt: timestamp('created_at').defaultNow(),
});
