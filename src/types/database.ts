
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "admin_audit_logs": {
                  Row: {
                    "action": string,"actor_user_id": string | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": number,"metadata": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_user_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: never,"metadata"?: NonNullable<Json>
                  }
                  Update: {
                    "action"?: string,"actor_user_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: never,"metadata"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_user_id": string | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": number,"metadata": NonNullable<Json>,"organization_id": string,"request_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_user_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: never,"metadata"?: NonNullable<Json>,"organization_id": string,"request_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_user_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: never,"metadata"?: NonNullable<Json>,"organization_id"?: string,"request_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"catalog_import_runs": {
                  Row: {
                    "column_mapping": NonNullable<Json>,"created_by": string | null,"errors": NonNullable<Json>,"file_name": string,"file_sha256": string,"file_type": string,"finished_at": string | null,"id": string,"organization_id": string,"rows_imported": number,"rows_processed": number,"rows_rejected": number,"rows_total": number,"rows_updated": number,"started_at": string,"status": Database["public"]['Enums']["import_status"],"supplier_connection_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "column_mapping"?: NonNullable<Json>,"created_by"?: string | null,"errors"?: NonNullable<Json>,"file_name": string,"file_sha256": string,"file_type": string,"finished_at"?: string | null,"id"?: string,"organization_id": string,"rows_imported"?: number,"rows_processed"?: number,"rows_rejected"?: number,"rows_total"?: number,"rows_updated"?: number,"started_at"?: string,"status"?: Database["public"]['Enums']["import_status"],"supplier_connection_id": string
                  }
                  Update: {
                    "column_mapping"?: NonNullable<Json>,"created_by"?: string | null,"errors"?: NonNullable<Json>,"file_name"?: string,"file_sha256"?: string,"file_type"?: string,"finished_at"?: string | null,"id"?: string,"organization_id"?: string,"rows_imported"?: number,"rows_processed"?: number,"rows_rejected"?: number,"rows_total"?: number,"rows_updated"?: number,"started_at"?: string,"status"?: Database["public"]['Enums']["import_status"],"supplier_connection_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_import_runs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "catalog_import_runs_organization_id_supplier_connection_id_fkey"
      columns: ["organization_id","supplier_connection_id"]
isOneToOne: false
      referencedRelation: "supplier_connections"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"catalog_products": {
                  Row: {
                    "attributes": NonNullable<Json>,"brand": string | null,"category": string | null,"created_at": string,"description": string | null,"gtin": string | null,"id": string,"identifiers": NonNullable<Json>,"images": NonNullable<Json>,"is_example": boolean,"model": string | null,"normalized_title": string,"organization_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attributes"?: NonNullable<Json>,"brand"?: string | null,"category"?: string | null,"created_at"?: string,"description"?: string | null,"gtin"?: string | null,"id"?: string,"identifiers"?: NonNullable<Json>,"images"?: NonNullable<Json>,"is_example"?: boolean,"model"?: string | null,"normalized_title": string,"organization_id": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "attributes"?: NonNullable<Json>,"brand"?: string | null,"category"?: string | null,"created_at"?: string,"description"?: string | null,"gtin"?: string | null,"id"?: string,"identifiers"?: NonNullable<Json>,"images"?: NonNullable<Json>,"is_example"?: boolean,"model"?: string | null,"normalized_title"?: string,"organization_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_products_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"competitor_snapshots": {
                  Row: {
                    "catalog_product_id": string | null,"currency": string,"external_item_id": string,"id": string,"marketplace": string,"metadata": NonNullable<Json>,"observed_at": string,"observed_price": number,"observed_shipping": number | null,"organization_id": string,"seller_id": string | null,"source": string,"source_url": string | null,"title": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "catalog_product_id"?: string | null,"currency"?: string,"external_item_id": string,"id"?: string,"marketplace": string,"metadata"?: NonNullable<Json>,"observed_at"?: string,"observed_price": number,"observed_shipping"?: number | null,"organization_id": string,"seller_id"?: string | null,"source": string,"source_url"?: string | null,"title"?: string | null
                  }
                  Update: {
                    "catalog_product_id"?: string | null,"currency"?: string,"external_item_id"?: string,"id"?: string,"marketplace"?: string,"metadata"?: NonNullable<Json>,"observed_at"?: string,"observed_price"?: number,"observed_shipping"?: number | null,"organization_id"?: string,"seller_id"?: string | null,"source"?: string,"source_url"?: string | null,"title"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "competitor_snapshots_organization_id_catalog_product_id_fkey"
      columns: ["organization_id","catalog_product_id"]
isOneToOne: false
      referencedRelation: "catalog_products"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "competitor_snapshots_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_errors": {
                  Row: {
                    "context": NonNullable<Json>,"entity_id": string | null,"entity_type": string | null,"error_code": string | null,"id": string,"integration_type": string,"message": string,"occurred_at": string,"organization_id": string | null,"resolved_at": string | null,"resolved_by": string | null,"retryable": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "context"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type"?: string | null,"error_code"?: string | null,"id"?: string,"integration_type": string,"message": string,"occurred_at"?: string,"organization_id"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"retryable"?: boolean
                  }
                  Update: {
                    "context"?: NonNullable<Json>,"entity_id"?: string | null,"entity_type"?: string | null,"error_code"?: string | null,"id"?: string,"integration_type"?: string,"message"?: string,"occurred_at"?: string,"organization_id"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"retryable"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_errors_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_drafts": {
                  Row: {
                    "attributes": NonNullable<Json>,"catalog_product_id": string,"category_id": string | null,"condition": string,"created_at": string,"created_by": string | null,"description": string | null,"family_name": string | null,"id": string,"idempotency_key": string,"last_error": string | null,"listing_type_id": string | null,"marketplace_account_id": string | null,"organization_id": string,"pictures": NonNullable<Json>,"pricing_calculation_id": string | null,"published_listing_id": string | null,"status": Database["public"]['Enums']["listing_draft_status"],"supplier_offer_id": string | null,"target_price": number | null,"target_stock": number | null,"title": string | null,"updated_at": string,"validated_at": string | null,"validation_errors": NonNullable<Json>,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "attributes"?: NonNullable<Json>,"catalog_product_id": string,"category_id"?: string | null,"condition"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"family_name"?: string | null,"id"?: string,"idempotency_key"?: string,"last_error"?: string | null,"listing_type_id"?: string | null,"marketplace_account_id"?: string | null,"organization_id": string,"pictures"?: NonNullable<Json>,"pricing_calculation_id"?: string | null,"published_listing_id"?: string | null,"status"?: Database["public"]['Enums']["listing_draft_status"],"supplier_offer_id"?: string | null,"target_price"?: number | null,"target_stock"?: number | null,"title"?: string | null,"updated_at"?: string,"validated_at"?: string | null,"validation_errors"?: NonNullable<Json>,"version"?: number
                  }
                  Update: {
                    "attributes"?: NonNullable<Json>,"catalog_product_id"?: string,"category_id"?: string | null,"condition"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"family_name"?: string | null,"id"?: string,"idempotency_key"?: string,"last_error"?: string | null,"listing_type_id"?: string | null,"marketplace_account_id"?: string | null,"organization_id"?: string,"pictures"?: NonNullable<Json>,"pricing_calculation_id"?: string | null,"published_listing_id"?: string | null,"status"?: Database["public"]['Enums']["listing_draft_status"],"supplier_offer_id"?: string | null,"target_price"?: number | null,"target_stock"?: number | null,"title"?: string | null,"updated_at"?: string,"validated_at"?: string | null,"validation_errors"?: NonNullable<Json>,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_drafts_organization_id_catalog_product_id_fkey"
      columns: ["organization_id","catalog_product_id"]
isOneToOne: false
      referencedRelation: "catalog_products"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "listing_drafts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listing_drafts_organization_id_marketplace_account_id_fkey"
      columns: ["organization_id","marketplace_account_id"]
isOneToOne: false
      referencedRelation: "marketplace_accounts"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "listing_drafts_organization_id_supplier_offer_id_fkey"
      columns: ["organization_id","supplier_offer_id"]
isOneToOne: false
      referencedRelation: "supplier_offers"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "listing_drafts_pricing_calculation_fk"
      columns: ["organization_id","pricing_calculation_id"]
isOneToOne: false
      referencedRelation: "pricing_calculations"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "listing_drafts_published_listing_fk"
      columns: ["organization_id","published_listing_id"]
isOneToOne: false
      referencedRelation: "marketplace_listings"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"listing_variants": {
                  Row: {
                    "attributes": NonNullable<Json>,"available_stock": number | null,"external_item_id": string | null,"external_user_product_id": string | null,"external_variant_id": string | null,"id": string,"marketplace_listing_id": string,"organization_id": string,"price": number | null,"sku": string | null,"status": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attributes"?: NonNullable<Json>,"available_stock"?: number | null,"external_item_id"?: string | null,"external_user_product_id"?: string | null,"external_variant_id"?: string | null,"id"?: string,"marketplace_listing_id": string,"organization_id": string,"price"?: number | null,"sku"?: string | null,"status"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "attributes"?: NonNullable<Json>,"available_stock"?: number | null,"external_item_id"?: string | null,"external_user_product_id"?: string | null,"external_variant_id"?: string | null,"id"?: string,"marketplace_listing_id"?: string,"organization_id"?: string,"price"?: number | null,"sku"?: string | null,"status"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_variants_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listing_variants_organization_id_marketplace_listing_id_fkey"
      columns: ["organization_id","marketplace_listing_id"]
isOneToOne: false
      referencedRelation: "marketplace_listings"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"marketplace_accounts": {
                  Row: {
                    "account_tags": (string)[],"connected_by": string | null,"created_at": string,"external_account_id": string,"granted_scopes": (string)[],"id": string,"last_error": string | null,"last_synced_at": string | null,"marketplace": string,"nickname": string | null,"organization_id": string,"site_id": string,"status": Database["public"]['Enums']["marketplace_account_status"],"updated_at": string,"user_product_seller": boolean | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_tags"?: (string)[],"connected_by"?: string | null,"created_at"?: string,"external_account_id": string,"granted_scopes"?: (string)[],"id"?: string,"last_error"?: string | null,"last_synced_at"?: string | null,"marketplace": string,"nickname"?: string | null,"organization_id": string,"site_id"?: string,"status"?: Database["public"]['Enums']["marketplace_account_status"],"updated_at"?: string,"user_product_seller"?: boolean | null
                  }
                  Update: {
                    "account_tags"?: (string)[],"connected_by"?: string | null,"created_at"?: string,"external_account_id"?: string,"granted_scopes"?: (string)[],"id"?: string,"last_error"?: string | null,"last_synced_at"?: string | null,"marketplace"?: string,"nickname"?: string | null,"organization_id"?: string,"site_id"?: string,"status"?: Database["public"]['Enums']["marketplace_account_status"],"updated_at"?: string,"user_product_seller"?: boolean | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketplace_accounts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"marketplace_fee_snapshots": {
                  Row: {
                    "category_id": string | null,"effective_at": string,"fixed_fee": number,"id": string,"listing_type": string,"marketplace": string,"notes": string | null,"organization_id": string | null,"price_max": number | null,"price_min": number | null,"raw": NonNullable<Json>,"retrieved_at": string,"shipping_estimate": number | null,"site_id": string,"source": string,"variable_fee_rate": number
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"effective_at"?: string,"fixed_fee"?: number,"id"?: string,"listing_type": string,"marketplace": string,"notes"?: string | null,"organization_id"?: string | null,"price_max"?: number | null,"price_min"?: number | null,"raw"?: NonNullable<Json>,"retrieved_at"?: string,"shipping_estimate"?: number | null,"site_id"?: string,"source": string,"variable_fee_rate": number
                  }
                  Update: {
                    "category_id"?: string | null,"effective_at"?: string,"fixed_fee"?: number,"id"?: string,"listing_type"?: string,"marketplace"?: string,"notes"?: string | null,"organization_id"?: string | null,"price_max"?: number | null,"price_min"?: number | null,"raw"?: NonNullable<Json>,"retrieved_at"?: string,"shipping_estimate"?: number | null,"site_id"?: string,"source"?: string,"variable_fee_rate"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketplace_fee_snapshots_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"marketplace_listings": {
                  Row: {
                    "auto_sync_stock": boolean,"available_stock": number | null,"catalog_product_id": string | null,"created_at": string,"external_item_id": string,"external_user_product_id": string | null,"family_name": string | null,"id": string,"last_synced_at": string | null,"listing_draft_id": string | null,"marketplace_account_id": string,"organization_id": string,"permalink": string | null,"price": number | null,"raw": NonNullable<Json>,"status": string,"supplier_offer_id": string | null,"title": string | null,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_sync_stock"?: boolean,"available_stock"?: number | null,"catalog_product_id"?: string | null,"created_at"?: string,"external_item_id": string,"external_user_product_id"?: string | null,"family_name"?: string | null,"id"?: string,"last_synced_at"?: string | null,"listing_draft_id"?: string | null,"marketplace_account_id": string,"organization_id": string,"permalink"?: string | null,"price"?: number | null,"raw"?: NonNullable<Json>,"status": string,"supplier_offer_id"?: string | null,"title"?: string | null,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "auto_sync_stock"?: boolean,"available_stock"?: number | null,"catalog_product_id"?: string | null,"created_at"?: string,"external_item_id"?: string,"external_user_product_id"?: string | null,"family_name"?: string | null,"id"?: string,"last_synced_at"?: string | null,"listing_draft_id"?: string | null,"marketplace_account_id"?: string,"organization_id"?: string,"permalink"?: string | null,"price"?: number | null,"raw"?: NonNullable<Json>,"status"?: string,"supplier_offer_id"?: string | null,"title"?: string | null,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketplace_listings_organization_id_catalog_product_id_fkey"
      columns: ["organization_id","catalog_product_id"]
isOneToOne: false
      referencedRelation: "catalog_products"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "marketplace_listings_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marketplace_listings_organization_id_listing_draft_id_fkey"
      columns: ["organization_id","listing_draft_id"]
isOneToOne: false
      referencedRelation: "listing_drafts"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "marketplace_listings_organization_id_marketplace_account_i_fkey"
      columns: ["organization_id","marketplace_account_id"]
isOneToOne: false
      referencedRelation: "marketplace_accounts"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "marketplace_listings_organization_id_supplier_offer_id_fkey"
      columns: ["organization_id","supplier_offer_id"]
isOneToOne: false
      referencedRelation: "supplier_offers"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "external_item_id": string,"external_variation_id": string,"id": string,"item_total": number,"marketplace_listing_id": string | null,"metadata": NonNullable<Json>,"order_id": string,"organization_id": string,"quantity": number,"sale_fee": number | null,"sku": string | null,"supplier_offer_id": string | null,"title": string | null,"unit_price": number
                  }
                  ComputedFields: never
                  Insert: {
                    "external_item_id": string,"external_variation_id"?: string,"id"?: string,"item_total": number,"marketplace_listing_id"?: string | null,"metadata"?: NonNullable<Json>,"order_id": string,"organization_id": string,"quantity": number,"sale_fee"?: number | null,"sku"?: string | null,"supplier_offer_id"?: string | null,"title"?: string | null,"unit_price": number
                  }
                  Update: {
                    "external_item_id"?: string,"external_variation_id"?: string,"id"?: string,"item_total"?: number,"marketplace_listing_id"?: string | null,"metadata"?: NonNullable<Json>,"order_id"?: string,"organization_id"?: string,"quantity"?: number,"sale_fee"?: number | null,"sku"?: string | null,"supplier_offer_id"?: string | null,"title"?: string | null,"unit_price"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_organization_id_marketplace_listing_id_fkey"
      columns: ["organization_id","marketplace_listing_id"]
isOneToOne: false
      referencedRelation: "marketplace_listings"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "order_items_organization_id_order_id_fkey"
      columns: ["organization_id","order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "order_items_organization_id_supplier_offer_id_fkey"
      columns: ["organization_id","supplier_offer_id"]
isOneToOne: false
      referencedRelation: "supplier_offers"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "buyer_nickname": string | null,"created_at": string,"currency": string,"external_order_id": string,"external_pack_id": string | null,"external_shipment_id": string | null,"fulfillment_status": Database["public"]['Enums']["fulfillment_status"],"id": string,"last_synced_at": string,"marketplace_account_id": string,"metadata": NonNullable<Json>,"ordered_at": string | null,"organization_id": string,"status": string,"total_amount": number,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "buyer_nickname"?: string | null,"created_at"?: string,"currency"?: string,"external_order_id": string,"external_pack_id"?: string | null,"external_shipment_id"?: string | null,"fulfillment_status"?: Database["public"]['Enums']["fulfillment_status"],"id"?: string,"last_synced_at"?: string,"marketplace_account_id": string,"metadata"?: NonNullable<Json>,"ordered_at"?: string | null,"organization_id": string,"status": string,"total_amount": number,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "buyer_nickname"?: string | null,"created_at"?: string,"currency"?: string,"external_order_id"?: string,"external_pack_id"?: string | null,"external_shipment_id"?: string | null,"fulfillment_status"?: Database["public"]['Enums']["fulfillment_status"],"id"?: string,"last_synced_at"?: string,"marketplace_account_id"?: string,"metadata"?: NonNullable<Json>,"ordered_at"?: string | null,"organization_id"?: string,"status"?: string,"total_amount"?: number,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_organization_id_marketplace_account_id_fkey"
      columns: ["organization_id","marketplace_account_id"]
isOneToOne: false
      referencedRelation: "marketplace_accounts"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"organization_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"organization_id": string,"role": Database["public"]['Enums']["member_role"],"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email": string,"expires_at": string,"id"?: string,"invited_by"?: string | null,"organization_id": string,"role": Database["public"]['Enums']["member_role"],"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"organization_id"?: string,"role"?: Database["public"]['Enums']["member_role"],"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_members": {
                  Row: {
                    "created_at": string,"id": string,"organization_id": string,"role": Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"organization_id": string,"role": Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"organization_id"?: string,"role"?: Database["public"]['Enums']["member_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_members_profile_fk"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"slug": string,"status": Database["public"]['Enums']["organization_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"slug": string,"status"?: Database["public"]['Enums']["organization_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"slug"?: string,"status"?: Database["public"]['Enums']["organization_status"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"plans": {
                  Row: {
                    "code": string,"created_at": string,"description": string | null,"features": NonNullable<Json>,"is_default": boolean,"is_public": boolean,"limits": NonNullable<Json>,"monthly_price_cents": number | null,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"description"?: string | null,"features"?: NonNullable<Json>,"is_default"?: boolean,"is_public"?: boolean,"limits"?: NonNullable<Json>,"monthly_price_cents"?: number | null,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string | null,"features"?: NonNullable<Json>,"is_default"?: boolean,"is_public"?: boolean,"limits"?: NonNullable<Json>,"monthly_price_cents"?: number | null,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_admins": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pricing_calculations": {
                  Row: {
                    "break_even_price": number | null,"calculation_version": string,"catalog_product_id": string | null,"cost_total": number,"created_at": string,"created_by": string | null,"currency": string,"estimated_fees": number,"estimated_margin": number | null,"estimated_profit": number,"estimated_tax": number,"has_estimates": boolean,"id": string,"input_snapshot": NonNullable<Json>,"marketplace_account_id": string | null,"missing_inputs": (string)[],"organization_id": string,"pricing_profile_id": string | null,"pricing_rule_version_id": string | null,"result_snapshot": NonNullable<Json>,"selling_price": number,"supplier_offer_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "break_even_price"?: number | null,"calculation_version": string,"catalog_product_id"?: string | null,"cost_total": number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"estimated_fees": number,"estimated_margin"?: number | null,"estimated_profit": number,"estimated_tax": number,"has_estimates": boolean,"id"?: string,"input_snapshot": NonNullable<Json>,"marketplace_account_id"?: string | null,"missing_inputs"?: (string)[],"organization_id": string,"pricing_profile_id"?: string | null,"pricing_rule_version_id"?: string | null,"result_snapshot": NonNullable<Json>,"selling_price": number,"supplier_offer_id"?: string | null
                  }
                  Update: {
                    "break_even_price"?: number | null,"calculation_version"?: string,"catalog_product_id"?: string | null,"cost_total"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"estimated_fees"?: number,"estimated_margin"?: number | null,"estimated_profit"?: number,"estimated_tax"?: number,"has_estimates"?: boolean,"id"?: string,"input_snapshot"?: NonNullable<Json>,"marketplace_account_id"?: string | null,"missing_inputs"?: (string)[],"organization_id"?: string,"pricing_profile_id"?: string | null,"pricing_rule_version_id"?: string | null,"result_snapshot"?: NonNullable<Json>,"selling_price"?: number,"supplier_offer_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pricing_calculations_organization_id_catalog_product_id_fkey"
      columns: ["organization_id","catalog_product_id"]
isOneToOne: false
      referencedRelation: "catalog_products"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "pricing_calculations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pricing_calculations_organization_id_marketplace_account_i_fkey"
      columns: ["organization_id","marketplace_account_id"]
isOneToOne: false
      referencedRelation: "marketplace_accounts"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "pricing_calculations_organization_id_pricing_profile_id_fkey"
      columns: ["organization_id","pricing_profile_id"]
isOneToOne: false
      referencedRelation: "pricing_profiles"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "pricing_calculations_organization_id_pricing_rule_version__fkey"
      columns: ["organization_id","pricing_rule_version_id"]
isOneToOne: false
      referencedRelation: "pricing_rule_versions"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "pricing_calculations_organization_id_supplier_offer_id_fkey"
      columns: ["organization_id","supplier_offer_id"]
isOneToOne: false
      referencedRelation: "supplier_offers"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"pricing_profiles": {
                  Row: {
                    "created_at": string,"default_reserve_rate": number,"default_tax_rate": number,"id": string,"is_default": boolean,"name": string,"organization_id": string,"settings": NonNullable<Json>,"target_margin": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"default_reserve_rate"?: number,"default_tax_rate"?: number,"id"?: string,"is_default"?: boolean,"name": string,"organization_id": string,"settings"?: NonNullable<Json>,"target_margin": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_reserve_rate"?: number,"default_tax_rate"?: number,"id"?: string,"is_default"?: boolean,"name"?: string,"organization_id"?: string,"settings"?: NonNullable<Json>,"target_margin"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pricing_profiles_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"pricing_rule_versions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"effective_at": string,"id": string,"organization_id": string,"profile_id": string,"rules": NonNullable<Json>,"source": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"effective_at"?: string,"id"?: string,"organization_id": string,"profile_id": string,"rules": NonNullable<Json>,"source"?: string,"version": number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"effective_at"?: string,"id"?: string,"organization_id"?: string,"profile_id"?: string,"rules"?: NonNullable<Json>,"source"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pricing_rule_versions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pricing_rule_versions_organization_id_profile_id_fkey"
      columns: ["organization_id","profile_id"]
isOneToOne: false
      referencedRelation: "pricing_profiles"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string | null,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string | null,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"shipments": {
                  Row: {
                    "carrier": string | null,"created_at": string,"delivered_at": string | null,"dispatched_at": string | null,"id": string,"metadata": NonNullable<Json>,"organization_id": string,"status": string,"supplier_purchase_order_id": string,"tracking_code": string | null,"tracking_url": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "carrier"?: string | null,"created_at"?: string,"delivered_at"?: string | null,"dispatched_at"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"organization_id": string,"status"?: string,"supplier_purchase_order_id": string,"tracking_code"?: string | null,"tracking_url"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "carrier"?: string | null,"created_at"?: string,"delivered_at"?: string | null,"dispatched_at"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"organization_id"?: string,"status"?: string,"supplier_purchase_order_id"?: string,"tracking_code"?: string | null,"tracking_url"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shipments_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shipments_organization_id_supplier_purchase_order_id_fkey"
      columns: ["organization_id","supplier_purchase_order_id"]
isOneToOne: false
      referencedRelation: "supplier_purchase_orders"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"subscription_events": {
                  Row: {
                    "created_at": string,"event_type": string,"external_event_id": string | null,"id": number,"new_plan_code": string | null,"new_status": Database["public"]['Enums']["subscription_status"] | null,"old_plan_code": string | null,"old_status": Database["public"]['Enums']["subscription_status"] | null,"organization_id": string,"payload": NonNullable<Json>,"provider": string,"subscription_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_type": string,"external_event_id"?: string | null,"id"?: never,"new_plan_code"?: string | null,"new_status"?: Database["public"]['Enums']["subscription_status"] | null,"old_plan_code"?: string | null,"old_status"?: Database["public"]['Enums']["subscription_status"] | null,"organization_id": string,"payload"?: NonNullable<Json>,"provider": string,"subscription_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_type"?: string,"external_event_id"?: string | null,"id"?: never,"new_plan_code"?: string | null,"new_status"?: Database["public"]['Enums']["subscription_status"] | null,"old_plan_code"?: string | null,"old_status"?: Database["public"]['Enums']["subscription_status"] | null,"organization_id"?: string,"payload"?: NonNullable<Json>,"provider"?: string,"subscription_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_events_organization_id_subscription_id_fkey"
      columns: ["organization_id","subscription_id"]
isOneToOne: false
      referencedRelation: "subscriptions"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "created_at": string,"current_period_end": string | null,"current_period_start": string | null,"external_subscription_id": string | null,"id": string,"organization_id": string,"plan_code": string,"provider": string,"status": Database["public"]['Enums']["subscription_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"current_period_end"?: string | null,"current_period_start"?: string | null,"external_subscription_id"?: string | null,"id"?: string,"organization_id": string,"plan_code": string,"provider": string,"status": Database["public"]['Enums']["subscription_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"current_period_end"?: string | null,"current_period_start"?: string | null,"external_subscription_id"?: string | null,"id"?: string,"organization_id"?: string,"plan_code"?: string,"provider"?: string,"status"?: Database["public"]['Enums']["subscription_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_plan_code_fkey"
      columns: ["plan_code"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["code"]
    }
                  ]
                },"supplier_connections": {
                  Row: {
                    "configuration": NonNullable<Json>,"created_at": string,"display_name": string,"dropship_agreement_confirmed": boolean,"id": string,"organization_id": string,"status": Database["public"]['Enums']["supplier_connection_status"],"supplier_source_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "configuration"?: NonNullable<Json>,"created_at"?: string,"display_name": string,"dropship_agreement_confirmed"?: boolean,"id"?: string,"organization_id": string,"status"?: Database["public"]['Enums']["supplier_connection_status"],"supplier_source_id": string,"updated_at"?: string
                  }
                  Update: {
                    "configuration"?: NonNullable<Json>,"created_at"?: string,"display_name"?: string,"dropship_agreement_confirmed"?: boolean,"id"?: string,"organization_id"?: string,"status"?: Database["public"]['Enums']["supplier_connection_status"],"supplier_source_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_connections_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_connections_supplier_source_id_fkey"
      columns: ["supplier_source_id"]
isOneToOne: false
      referencedRelation: "supplier_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_offers": {
                  Row: {
                    "available_stock": number,"catalog_product_id": string,"cost_updated_at": string,"created_at": string,"currency": string,"external_offer_id": string | null,"handling_time_days": number | null,"id": string,"inbound_shipping_cost": number,"last_synced_at": string | null,"organization_id": string,"sku": string,"source": string,"status": Database["public"]['Enums']["offer_status"],"supplier_connection_id": string,"supplier_cost": number,"supplier_handling_fee": number,"supplier_source_id": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "available_stock"?: number,"catalog_product_id": string,"cost_updated_at"?: string,"created_at"?: string,"currency"?: string,"external_offer_id"?: string | null,"handling_time_days"?: number | null,"id"?: string,"inbound_shipping_cost"?: number,"last_synced_at"?: string | null,"organization_id": string,"sku": string,"source": string,"status"?: Database["public"]['Enums']["offer_status"],"supplier_connection_id": string,"supplier_cost": number,"supplier_handling_fee"?: number,"supplier_source_id": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "available_stock"?: number,"catalog_product_id"?: string,"cost_updated_at"?: string,"created_at"?: string,"currency"?: string,"external_offer_id"?: string | null,"handling_time_days"?: number | null,"id"?: string,"inbound_shipping_cost"?: number,"last_synced_at"?: string | null,"organization_id"?: string,"sku"?: string,"source"?: string,"status"?: Database["public"]['Enums']["offer_status"],"supplier_connection_id"?: string,"supplier_cost"?: number,"supplier_handling_fee"?: number,"supplier_source_id"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_offers_organization_id_catalog_product_id_fkey"
      columns: ["organization_id","catalog_product_id"]
isOneToOne: false
      referencedRelation: "catalog_products"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "supplier_offers_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_offers_organization_id_supplier_connection_id_fkey"
      columns: ["organization_id","supplier_connection_id"]
isOneToOne: false
      referencedRelation: "supplier_connections"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "supplier_offers_supplier_source_id_fkey"
      columns: ["supplier_source_id"]
isOneToOne: false
      referencedRelation: "supplier_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_purchase_orders": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"external_purchase_order_id": string | null,"id": string,"idempotency_key": string,"metadata": NonNullable<Json>,"notes": string | null,"order_id": string,"organization_id": string,"status": Database["public"]['Enums']["purchase_order_status"],"submission_method": string,"submitted_at": string | null,"submitted_by": string | null,"supplier_connection_id": string,"total_cost": number | null,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"external_purchase_order_id"?: string | null,"id"?: string,"idempotency_key"?: string,"metadata"?: NonNullable<Json>,"notes"?: string | null,"order_id": string,"organization_id": string,"status"?: Database["public"]['Enums']["purchase_order_status"],"submission_method"?: string,"submitted_at"?: string | null,"submitted_by"?: string | null,"supplier_connection_id": string,"total_cost"?: number | null,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"external_purchase_order_id"?: string | null,"id"?: string,"idempotency_key"?: string,"metadata"?: NonNullable<Json>,"notes"?: string | null,"order_id"?: string,"organization_id"?: string,"status"?: Database["public"]['Enums']["purchase_order_status"],"submission_method"?: string,"submitted_at"?: string | null,"submitted_by"?: string | null,"supplier_connection_id"?: string,"total_cost"?: number | null,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_purchase_orders_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_purchase_orders_organization_id_order_id_fkey"
      columns: ["organization_id","order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "supplier_purchase_orders_organization_id_supplier_connecti_fkey"
      columns: ["organization_id","supplier_connection_id"]
isOneToOne: false
      referencedRelation: "supplier_connections"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"supplier_sources": {
                  Row: {
                    "adapter_key": string,"capabilities": NonNullable<Json>,"created_at": string,"description": string | null,"id": string,"name": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adapter_key": string,"capabilities"?: NonNullable<Json>,"created_at"?: string,"description"?: string | null,"id"?: string,"name": string,"status": string
                  }
                  Update: {
                    "adapter_key"?: string,"capabilities"?: NonNullable<Json>,"created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sync_jobs": {
                  Row: {
                    "attempts": number,"available_at": string,"created_at": string,"deduplication_key": string | null,"duration_ms": number | null,"finished_at": string | null,"id": string,"job_type": string,"last_error": string | null,"locked_at": string | null,"locked_by": string | null,"max_attempts": number,"organization_id": string | null,"payload": NonNullable<Json>,"priority": number,"result": Json | null,"started_at": string | null,"status": Database["public"]['Enums']["job_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"available_at"?: string,"created_at"?: string,"deduplication_key"?: string | null,"duration_ms"?: number | null,"finished_at"?: string | null,"id"?: string,"job_type": string,"last_error"?: string | null,"locked_at"?: string | null,"locked_by"?: string | null,"max_attempts"?: number,"organization_id"?: string | null,"payload"?: NonNullable<Json>,"priority"?: number,"result"?: Json | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["job_status"],"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"available_at"?: string,"created_at"?: string,"deduplication_key"?: string | null,"duration_ms"?: number | null,"finished_at"?: string | null,"id"?: string,"job_type"?: string,"last_error"?: string | null,"locked_at"?: string | null,"locked_by"?: string | null,"max_attempts"?: number,"organization_id"?: string | null,"payload"?: NonNullable<Json>,"priority"?: number,"result"?: Json | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["job_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sync_jobs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"usage_records": {
                  Row: {
                    "created_at": string,"id": number,"metadata": NonNullable<Json>,"metric": string,"organization_id": string,"period_end": string,"period_start": string,"quantity": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: never,"metadata"?: NonNullable<Json>,"metric": string,"organization_id": string,"period_end": string,"period_start": string,"quantity": number
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"metadata"?: NonNullable<Json>,"metric"?: string,"organization_id"?: string,"period_end"?: string,"period_start"?: string,"quantity"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "usage_records_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"webhook_events": {
                  Row: {
                    "application_id": string | null,"attempts": number,"event_key": string,"external_user_id": string | null,"id": string,"last_error": string | null,"marketplace": string,"marketplace_account_id": string | null,"metadata": NonNullable<Json>,"organization_id": string | null,"processed_at": string | null,"received_at": string,"resource": string,"status": string,"topic": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id"?: string | null,"attempts"?: number,"event_key": string,"external_user_id"?: string | null,"id"?: string,"last_error"?: string | null,"marketplace": string,"marketplace_account_id"?: string | null,"metadata"?: NonNullable<Json>,"organization_id"?: string | null,"processed_at"?: string | null,"received_at"?: string,"resource": string,"status"?: string,"topic": string
                  }
                  Update: {
                    "application_id"?: string | null,"attempts"?: number,"event_key"?: string,"external_user_id"?: string | null,"id"?: string,"last_error"?: string | null,"marketplace"?: string,"marketplace_account_id"?: string | null,"metadata"?: NonNullable<Json>,"organization_id"?: string | null,"processed_at"?: string | null,"received_at"?: string,"resource"?: string,"status"?: string,"topic"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "webhook_events_marketplace_account_id_fkey"
      columns: ["marketplace_account_id"]
isOneToOne: false
      referencedRelation: "marketplace_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "webhook_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: { "invite_token": string }; Returns: string
                           },
"claim_sync_jobs":
{ Args: { "p_batch"?: number,"p_lease_seconds"?: number,"p_worker": string }; Returns: {
              "attempts": number,
"available_at": string,
"created_at": string,
"deduplication_key": string | null,
"duration_ms": number | null,
"finished_at": string | null,
"id": string,
"job_type": string,
"last_error": string | null,
"locked_at": string | null,
"locked_by": string | null,
"max_attempts": number,
"organization_id": string | null,
"payload": NonNullable<Json>,
"priority": number,
"result": Json | null,
"started_at": string | null,
"status": Database["public"]['Enums']["job_status"],
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "sync_jobs"
        isOneToOne: false
        isSetofReturn: true
      } },
"complete_sync_job":
{ Args: { "p_job_id": string,"p_result"?: Json,"p_worker": string }; Returns: boolean
                           },
"create_organization":
{ Args: { "org_name": string,"org_slug": string }; Returns: string
                           },
"enqueue_sync_job":
{ Args: { "p_available_at"?: string,"p_deduplication_key"?: string,"p_job_type": string,"p_max_attempts"?: number,"p_organization_id": string,"p_payload"?: Json,"p_priority"?: number }; Returns: string
                           },
"fail_sync_job":
{ Args: { "p_backoff_seconds"?: number,"p_error": string,"p_job_id": string,"p_retryable": boolean,"p_worker": string }; Returns: Database["public"]['Enums']["job_status"]
                           },
"organization_plan":
{ Args: { "org": string }; Returns: {
              "features": Json,"limits": Json,"plan_code": string,"plan_name": string
            }[]
                           },
"rate_limit_hit":
{ Args: { "p_key": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"retry_sync_job":
{ Args: { "p_job_id": string }; Returns: boolean
                           }
          }
          Enums: {
            "fulfillment_status": "pending"|"awaiting_supplier"|"forwarded"|"shipped"|"delivered"|"problem"|"canceled","import_status": "previewed"|"importing"|"completed"|"failed"|"canceled","job_status": "pending"|"running"|"succeeded"|"failed"|"dead","listing_draft_status": "draft"|"validated"|"invalid"|"publishing"|"published"|"failed","marketplace_account_status": "active"|"reauthorization_required"|"disconnected"|"error","member_role": "owner"|"admin"|"operator"|"viewer","offer_status": "active"|"paused"|"out_of_stock"|"discontinued","organization_status": "active"|"suspended"|"deleted","purchase_order_status": "draft"|"submitted"|"accepted"|"rejected"|"shipped"|"delivered"|"canceled"|"failed","subscription_status": "trialing"|"active"|"past_due"|"canceled"|"incomplete"|"paused","supplier_connection_status": "active"|"pending"|"error"|"disabled"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "fulfillment_status": ["pending", "awaiting_supplier", "forwarded", "shipped", "delivered", "problem", "canceled"],"import_status": ["previewed", "importing", "completed", "failed", "canceled"],"job_status": ["pending", "running", "succeeded", "failed", "dead"],"listing_draft_status": ["draft", "validated", "invalid", "publishing", "published", "failed"],"marketplace_account_status": ["active", "reauthorization_required", "disconnected", "error"],"member_role": ["owner", "admin", "operator", "viewer"],"offer_status": ["active", "paused", "out_of_stock", "discontinued"],"organization_status": ["active", "suspended", "deleted"],"purchase_order_status": ["draft", "submitted", "accepted", "rejected", "shipped", "delivered", "canceled", "failed"],"subscription_status": ["trialing", "active", "past_due", "canceled", "incomplete", "paused"],"supplier_connection_status": ["active", "pending", "error", "disabled"]
          }
        }
} as const
