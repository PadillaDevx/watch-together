CREATE TABLE "sessions" (
	"token" varchar(64) PRIMARY KEY NOT NULL,
	"username" varchar(50) NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
