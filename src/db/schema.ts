import { pgTable, serial, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  photoUrl: text('photo_url'),
  credits: integer('credits').default(3).notNull(),
  totalAllowed: integer('total_allowed').default(3).notNull(),
  isApproved: boolean('is_approved').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const videos = pgTable('videos', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  userEmail: text('user_email'),
  topic: text('topic').notNull(),
  fullScript: text('full_script').notNull(),
  scriptJson: text('script_json'), // JSON array of script segments
  hashtagsJson: text('hashtags_json'), // JSON array of hashtags
  imageUrlsJson: text('image_urls_json'), // JSON array of image URLs
  captionStyle: text('caption_style'),
  voice: text('voice'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  userEmail: text('user_email').notNull(),
  displayName: text('display_name'),
  planName: text('plan_name').notNull(),
  amount: text('amount').notNull(),
  status: text('status').default('PENDING').notNull(), // 'PENDING' | 'APPROVED' | 'REJECTED'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  approvedAt: timestamp('approved_at'),
});

