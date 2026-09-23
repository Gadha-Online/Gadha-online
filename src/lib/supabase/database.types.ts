export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      about_page_settings: {
        Row: {
          hero_subtitle: string
          hero_title: string
          id: number
          mission_text: string
          mission_title: string
          updated_at: string
          vision_text: string
          vision_title: string
        }
        Insert: {
          hero_subtitle?: string
          hero_title?: string
          id?: number
          mission_text?: string
          mission_title?: string
          updated_at?: string
          vision_text?: string
          vision_title?: string
        }
        Update: {
          hero_subtitle?: string
          hero_title?: string
          id?: number
          mission_text?: string
          mission_title?: string
          updated_at?: string
          vision_text?: string
          vision_title?: string
        }
        Relationships: []
      }
      achievements: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string
          show_on_site: boolean
          stat_label: string
          stat_value: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          show_on_site?: boolean
          stat_label: string
          stat_value: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          show_on_site?: boolean
          stat_label?: string
          stat_value?: string
        }
        Relationships: []
      }
      admin_invitations: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          invited_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link_url: string | null
          message: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          message: string
          title: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          message?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      assignments: {
        Row: {
          booking_id: string | null
          course_id: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          feedback: string | null
          id: string
          score: number | null
          session_id: string | null
          status: string
          student_id: string
          subject: string
          submission_url: string | null
          submitted_at: string | null
          title: string
        }
        Insert: {
          booking_id?: string | null
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          feedback?: string | null
          id?: string
          score?: number | null
          session_id?: string | null
          status?: string
          student_id: string
          subject: string
          submission_url?: string | null
          submitted_at?: string | null
          title: string
        }
        Update: {
          booking_id?: string | null
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          feedback?: string | null
          id?: string
          score?: number | null
          session_id?: string | null
          status?: string
          student_id?: string
          subject?: string
          submission_url?: string | null
          submitted_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "mentors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          notes: string | null
          scheduled_class_id: string | null
          session_date: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          subject: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          scheduled_class_id?: string | null
          session_date: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          subject: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          scheduled_class_id?: string | null
          session_date?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_scheduled_class_id_fkey"
            columns: ["scheduled_class_id"]
            isOneToOne: false
            referencedRelation: "scheduled_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payment_logs: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          id: string
          notes: string | null
          payment_method: string | null
          payment_reference: string | null
          recorded_by: string | null
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          recorded_by?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_payment_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payment_logs_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          admin_notes: string | null
          amount_paid: number
          course_id: string | null
          created_at: string
          due_date: string | null
          id: string
          mentor_confirmed: boolean
          mentor_confirmed_at: string | null
          mentor_id: string | null
          parent_id: string | null
          payment_collected_at: string | null
          payment_collected_by: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          session_id: string | null
          status: Database["public"]["Enums"]["booking_status"]
          student_id: string
          total_amount: number | null
        }
        Insert: {
          admin_notes?: string | null
          amount_paid?: number
          course_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          mentor_confirmed?: boolean
          mentor_confirmed_at?: string | null
          mentor_id?: string | null
          parent_id?: string | null
          payment_collected_at?: string | null
          payment_collected_by?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          session_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          student_id: string
          total_amount?: number | null
        }
        Update: {
          admin_notes?: string | null
          amount_paid?: number
          course_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          mentor_confirmed?: boolean
          mentor_confirmed_at?: string | null
          mentor_id?: string | null
          parent_id?: string | null
          payment_collected_at?: string | null
          payment_collected_by?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          session_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          student_id?: string
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "mentors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_payment_collected_by_fkey"
            columns: ["payment_collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_participants: {
        Row: {
          chat_room_id: string
          user_id: string
        }
        Insert: {
          chat_room_id: string
          user_id: string
        }
        Update: {
          chat_room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_chat_room_id_fkey"
            columns: ["chat_room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          created_at: string
          id: string
          name: string | null
          room_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          room_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          room_type?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_resolved: boolean
          message: string
          phone: string | null
          subject: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_resolved?: boolean
          message: string
          phone?: string | null
          subject: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_resolved?: boolean
          message?: string
          phone?: string | null
          subject?: string
        }
        Relationships: []
      }
      course_units: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          module_name: string | null
          order_index: number
          title: string
          youtube_url: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          module_name?: string | null
          order_index?: number
          title: string
          youtube_url: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          module_name?: string | null
          order_index?: number
          title?: string
          youtube_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_units_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          about_course: string | null
          batch_end_date: string | null
          batch_start_date: string | null
          class_days: string | null
          class_level: string | null
          class_time: string | null
          class_timing: string | null
          cover_image_url: string | null
          created_at: string
          curriculum: Json | null
          description: string
          duration_days: number | null
          duration_minutes: number
          format: string
          id: string
          inclusions: string[] | null
          inclusions_enabled: boolean[] | null
          join_url: string | null
          languages: string[] | null
          learning_outcomes: string[] | null
          mentor_id: string | null
          price: number
          rating: number | null
          sessions_per_week: number | null
          status: string
          students_count: number
          subject: string
          title: string
          total_sessions: number | null
          updated_at: string
        }
        Insert: {
          about_course?: string | null
          batch_end_date?: string | null
          batch_start_date?: string | null
          class_days?: string | null
          class_level?: string | null
          class_time?: string | null
          class_timing?: string | null
          cover_image_url?: string | null
          created_at?: string
          curriculum?: Json | null
          description: string
          duration_days?: number | null
          duration_minutes?: number
          format?: string
          id?: string
          inclusions?: string[] | null
          inclusions_enabled?: boolean[] | null
          join_url?: string | null
          languages?: string[] | null
          learning_outcomes?: string[] | null
          mentor_id?: string | null
          price: number
          rating?: number | null
          sessions_per_week?: number | null
          status?: string
          students_count?: number
          subject: string
          title: string
          total_sessions?: number | null
          updated_at?: string
        }
        Update: {
          about_course?: string | null
          batch_end_date?: string | null
          batch_start_date?: string | null
          class_days?: string | null
          class_level?: string | null
          class_time?: string | null
          class_timing?: string | null
          cover_image_url?: string | null
          created_at?: string
          curriculum?: Json | null
          description?: string
          duration_days?: number | null
          duration_minutes?: number
          format?: string
          id?: string
          inclusions?: string[] | null
          inclusions_enabled?: boolean[] | null
          join_url?: string | null
          languages?: string[] | null
          learning_outcomes?: string[] | null
          mentor_id?: string | null
          price?: number
          rating?: number | null
          sessions_per_week?: number | null
          status?: string
          students_count?: number
          subject?: string
          title?: string
          total_sessions?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "mentors"
            referencedColumns: ["id"]
          },
        ]
      }
      error_log: {
        Row: {
          created_at: string | null
          id: number
          msg: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          msg?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          msg?: string | null
        }
        Relationships: []
      }
      homepage_settings: {
        Row: {
          accented_text: string
          c1: string
          c2: string
          c3: string
          c4: string
          cl1: string
          cl2: string
          cl3: string
          cl4: string
          headline: string
          hero_image_url: string | null
          id: number
          primary_cta: string
          primary_link: string
          secondary_cta: string
          secondary_link: string
          subheading: string
          updated_at: string
        }
        Insert: {
          accented_text?: string
          c1?: string
          c2?: string
          c3?: string
          c4?: string
          cl1?: string
          cl2?: string
          cl3?: string
          cl4?: string
          headline?: string
          hero_image_url?: string | null
          id?: number
          primary_cta?: string
          primary_link?: string
          secondary_cta?: string
          secondary_link?: string
          subheading?: string
          updated_at?: string
        }
        Update: {
          accented_text?: string
          c1?: string
          c2?: string
          c3?: string
          c4?: string
          cl1?: string
          cl2?: string
          cl3?: string
          cl4?: string
          headline?: string
          hero_image_url?: string | null
          id?: number
          primary_cta?: string
          primary_link?: string
          secondary_cta?: string
          secondary_link?: string
          subheading?: string
          updated_at?: string
        }
        Relationships: []
      }
      mentor_invitations: {
        Row: {
          created_at: string
          email: string
          experience: number | null
          expertise: string[]
          full_name: string
          hourly_rate: number
          id: string
          qualification: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          experience?: number | null
          expertise?: string[]
          full_name: string
          hourly_rate?: number
          id?: string
          qualification?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          experience?: number | null
          expertise?: string[]
          full_name?: string
          hourly_rate?: number
          id?: string
          qualification?: string | null
          status?: string
        }
        Relationships: []
      }
      mentor_notifications: {
        Row: {
          class_id: string | null
          created_at: string
          id: string
          is_read: boolean
          link_url: string | null
          mentor_id: string
          message: string
          scheduled_for: string
          title: string
          type: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          mentor_id: string
          message: string
          scheduled_for: string
          title: string
          type: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          mentor_id?: string
          message?: string
          scheduled_for?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_notifications_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "scheduled_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_notifications_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentors: {
        Row: {
          availability: Json | null
          bio: string | null
          created_at: string
          experience: number | null
          expertise: string[]
          hourly_rate: number
          id: string
          is_active: boolean
          qualification: string | null
          rating: number | null
          verified: boolean | null
        }
        Insert: {
          availability?: Json | null
          bio?: string | null
          created_at?: string
          experience?: number | null
          expertise?: string[]
          hourly_rate?: number
          id: string
          is_active?: boolean
          qualification?: string | null
          rating?: number | null
          verified?: boolean | null
        }
        Update: {
          availability?: Json | null
          bio?: string | null
          created_at?: string
          experience?: number | null
          expertise?: string[]
          hourly_rate?: number
          id?: string
          is_active?: boolean
          qualification?: string | null
          rating?: number | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "mentors_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          chat_room_id: string
          content: string
          created_at: string
          file_url: string | null
          id: string
          sender_id: string
        }
        Insert: {
          chat_room_id: string
          content: string
          created_at?: string
          file_url?: string | null
          id?: string
          sender_id: string
        }
        Update: {
          chat_room_id?: string
          content?: string
          created_at?: string
          file_url?: string | null
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_room_id_fkey"
            columns: ["chat_room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parents: {
        Row: {
          address: string | null
          created_at: string
          id: string
          notification_preferences: Json | null
          phone: string | null
          two_factor_enabled: boolean | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id: string
          notification_preferences?: Json | null
          phone?: string | null
          two_factor_enabled?: boolean | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          notification_preferences?: Json | null
          phone?: string | null
          two_factor_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "parents_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          allow_signups: boolean
          commission_rate: number
          id: number
          updated_at: string | null
        }
        Insert: {
          allow_signups?: boolean
          commission_rate?: number
          id?: number
          updated_at?: string | null
        }
        Update: {
          allow_signups?: boolean
          commission_rate?: number
          id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      resources: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          mentor_id: string
          name: string
          size: string | null
          student_id: string | null
          subject: string
          type: Database["public"]["Enums"]["resource_type"]
          url: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          mentor_id: string
          name: string
          size?: string | null
          student_id?: string | null
          subject: string
          type?: Database["public"]["Enums"]["resource_type"]
          url: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          mentor_id?: string
          name?: string
          size?: string | null
          student_id?: string | null
          subject?: string
          type?: Database["public"]["Enums"]["resource_type"]
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "mentors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          course_id: string | null
          created_at: string | null
          id: string
          rating: number
          session_id: string | null
          student_id: string | null
          student_name: string | null
        }
        Insert: {
          comment?: string | null
          course_id?: string | null
          created_at?: string | null
          id?: string
          rating: number
          session_id?: string | null
          student_id?: string | null
          student_name?: string | null
        }
        Update: {
          comment?: string | null
          course_id?: string | null
          created_at?: string | null
          id?: string
          rating?: number
          session_id?: string | null
          student_id?: string | null
          student_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_classes: {
        Row: {
          attachment_url: string | null
          booking_id: string
          created_at: string
          duration_minutes: number
          icon_name: string | null
          id: string
          join_url: string | null
          mentor_id: string | null
          recording_url: string | null
          scheduled_at: string
          status: string
          student_id: string
          subject: string
          title: string
          topic_details: string | null
        }
        Insert: {
          attachment_url?: string | null
          booking_id: string
          created_at?: string
          duration_minutes?: number
          icon_name?: string | null
          id?: string
          join_url?: string | null
          mentor_id?: string | null
          recording_url?: string | null
          scheduled_at: string
          status?: string
          student_id: string
          subject: string
          title: string
          topic_details?: string | null
        }
        Update: {
          attachment_url?: string | null
          booking_id?: string
          created_at?: string
          duration_minutes?: number
          icon_name?: string | null
          id?: string
          join_url?: string | null
          mentor_id?: string | null
          recording_url?: string | null
          scheduled_at?: string
          status?: string
          student_id?: string
          subject?: string
          title?: string
          topic_details?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_classes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_classes_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "mentors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_classes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      session_mentors: {
        Row: {
          created_at: string | null
          mentor_id: string
          session_id: string
        }
        Insert: {
          created_at?: string | null
          mentor_id: string
          session_id: string
        }
        Update: {
          created_at?: string | null
          mentor_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_mentors_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "mentors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_mentors_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          about_session: string | null
          bookings_count: number
          class_level: string | null
          color_bg: string | null
          created_at: string
          days: string | null
          description: string | null
          duration_minutes: number
          duration_options: string | null
          icon_name: string | null
          id: string
          inclusions: string[] | null
          inclusions_enabled: boolean[] | null
          is_repeatable: boolean | null
          join_url: string | null
          language: string | null
          mentor_id: string
          platform: string | null
          price: number
          reschedule_policy: string | null
          session_date: string | null
          session_time: string | null
          status: string
          subject: string
          title: string
          type: string
          whats_covered: string[] | null
        }
        Insert: {
          about_session?: string | null
          bookings_count?: number
          class_level?: string | null
          color_bg?: string | null
          created_at?: string
          days?: string | null
          description?: string | null
          duration_minutes?: number
          duration_options?: string | null
          icon_name?: string | null
          id?: string
          inclusions?: string[] | null
          inclusions_enabled?: boolean[] | null
          is_repeatable?: boolean | null
          join_url?: string | null
          language?: string | null
          mentor_id: string
          platform?: string | null
          price: number
          reschedule_policy?: string | null
          session_date?: string | null
          session_time?: string | null
          status?: string
          subject: string
          title: string
          type?: string
          whats_covered?: string[] | null
        }
        Update: {
          about_session?: string | null
          bookings_count?: number
          class_level?: string | null
          color_bg?: string | null
          created_at?: string
          days?: string | null
          description?: string | null
          duration_minutes?: number
          duration_options?: string | null
          icon_name?: string | null
          id?: string
          inclusions?: string[] | null
          inclusions_enabled?: boolean[] | null
          is_repeatable?: boolean | null
          join_url?: string | null
          language?: string | null
          mentor_id?: string
          platform?: string | null
          price?: number
          reschedule_policy?: string | null
          session_date?: string | null
          session_time?: string | null
          status?: string
          subject?: string
          title?: string
          type?: string
          whats_covered?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "mentors"
            referencedColumns: ["id"]
          },
        ]
      }
      student_invitations: {
        Row: {
          created_at: string
          date_of_birth: string | null
          email: string
          full_name: string
          grade_level: string | null
          id: string
          parent_id: string | null
          school_name: string | null
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          email: string
          full_name: string
          grade_level?: string | null
          id?: string
          parent_id?: string | null
          school_name?: string | null
          status?: string
          token?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          email?: string
          full_name?: string
          grade_level?: string | null
          id?: string
          parent_id?: string | null
          school_name?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_invitations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string
          date_of_birth: string | null
          grade_level: string | null
          id: string
          interests: string | null
          parent_id: string | null
          school_name: string | null
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          grade_level?: string | null
          id: string
          interests?: string | null
          parent_id?: string | null
          school_name?: string | null
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          grade_level?: string | null
          id?: string
          interests?: string | null
          parent_id?: string | null
          school_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          created_at: string
          icon_name: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          icon_name?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          icon_name?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          avatar_bg: string
          avatar_text: string
          bio: string
          created_at: string
          display_order: number
          id: string
          name: string
          photo_url: string
          role: string
          show_on_site: boolean
        }
        Insert: {
          avatar_bg?: string
          avatar_text: string
          bio?: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
          photo_url?: string
          role: string
          show_on_site?: boolean
        }
        Update: {
          avatar_bg?: string
          avatar_text?: string
          bio?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          photo_url?: string
          role?: string
          show_on_site?: boolean
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          avatar_bg: string
          avatar_text: string
          created_at: string
          id: string
          media_type: string | null
          media_url: string | null
          quote: string
          rating: number
          role: string
          show_on_site: boolean
          student_name: string
        }
        Insert: {
          avatar_bg?: string
          avatar_text: string
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          quote: string
          rating?: number
          role: string
          show_on_site?: boolean
          student_name: string
        }
        Update: {
          avatar_bg?: string
          avatar_text?: string
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          quote?: string
          rating?: number
          role?: string
          show_on_site?: boolean
          student_name?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link_url: string | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      video_progress: {
        Row: {
          completed: boolean
          created_at: string
          id: string
          last_watched_at: string
          student_id: string
          unit_id: string
          watch_percentage: number
        }
        Insert: {
          completed?: boolean
          created_at?: string
          id?: string
          last_watched_at?: string
          student_id: string
          unit_id: string
          watch_percentage?: number
        }
        Update: {
          completed?: boolean
          created_at?: string
          id?: string
          last_watched_at?: string
          student_id?: string
          unit_id?: string
          watch_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_progress_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "course_units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      attendance_status: "present" | "absent" | "excused"
      booking_status: "pending" | "confirmed" | "cancelled" | "completed"
      payment_status:
        | "unpaid"
        | "paid"
        | "refunded"
        | "failed"
        | "partially_paid"
      resource_type: "pdf" | "video" | "link" | "document"
      user_role: "admin" | "mentor" | "parent" | "student"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      attendance_status: ["present", "absent", "excused"],
      booking_status: ["pending", "confirmed", "cancelled", "completed"],
      payment_status: [
        "unpaid",
        "paid",
        "refunded",
        "failed",
        "partially_paid",
      ],
      resource_type: ["pdf", "video", "link", "document"],
      user_role: ["admin", "mentor", "parent", "student"],
    },
  },
} as const
