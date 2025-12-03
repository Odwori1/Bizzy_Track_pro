                                      prosrc                                      
----------------------------------------------------------------------------------
                                                                                 +
 DECLARE                                                                         +
     v_business_id UUID;                                                         +
     v_customer_id UUID;                                                         +
     v_final_amount DECIMAL(15,2);                                               +
     v_item RECORD;                                                              +
     v_current_points DECIMAL(15,2);                                             +
     v_new_points DECIMAL(15,2);                                                 +
     v_loyalty_exists BOOLEAN;                                                   +
 BEGIN                                                                           +
     -- Get business ID, customer ID, and final amount from transaction          +
     SELECT business_id, customer_id, final_amount                               +
     INTO v_business_id, v_customer_id, v_final_amount                           +
     FROM pos_transactions WHERE id = p_pos_transaction_id;                      +
                                                                                 +
     IF NOT FOUND THEN                                                           +
         RETURN QUERY SELECT false, 'POS transaction not found';                 +
         RETURN;                                                                 +
     END IF;                                                                     +
                                                                                 +
     -- Update stock for each product in the transaction                         +
     FOR v_item IN (                                                             +
         SELECT pti.product_id, pti.quantity, pti.inventory_item_id              +
         FROM pos_transaction_items pti                                          +
         WHERE pti.pos_transaction_id = p_pos_transaction_id                     +
         AND (pti.product_id IS NOT NULL OR pti.inventory_item_id IS NOT NULL)   +
     ) LOOP                                                                      +
         IF v_item.product_id IS NOT NULL THEN                                   +
             -- Update product stock                                             +
             UPDATE products                                                     +
             SET current_stock = current_stock - v_item.quantity,                +
                 updated_at = NOW()                                              +
             WHERE id = v_item.product_id                                        +
             AND business_id = v_business_id;                                    +
                                                                                 +
             -- Record inventory movement for product                            +
             INSERT INTO inventory_movements (                                   +
                 business_id, inventory_item_id, movement_type, quantity,        +
                 unit_cost, total_value, reference_type, reference_id, created_by+
             )                                                                   +
             SELECT                                                              +
                 v_business_id,                                                  +
                 NULL, -- No direct inventory item link for products             +
                 'sale',                                                         +
                 v_item.quantity,                                                +
                 p.cost_price,                                                   +
                 p.cost_price * v_item.quantity,                                 +
                 'pos_transaction',                                              +
                 p_pos_transaction_id,                                           +
                 pt.created_by                                                   +
             FROM products p                                                     +
             JOIN pos_transactions pt ON pt.id = p_pos_transaction_id            +
             WHERE p.id = v_item.product_id;                                     +
                                                                                 +
         ELSIF v_item.inventory_item_id IS NOT NULL THEN                         +
             -- Update inventory item stock using existing function              +
             PERFORM update_inventory_stock(                                     +
                 v_item.inventory_item_id,                                       +
                 v_item.quantity,                                                +
                 'sale'                                                          +
             );                                                                  +
         END IF;                                                                 +
     END LOOP;                                                                   +
                                                                                 +
     -- Handle customer loyalty only if customer exists                          +
     IF v_customer_id IS NOT NULL THEN                                           +
         -- Calculate points (1 point per 100 currency units spent)              +
         v_new_points := v_final_amount / 100;                                   +
                                                                                 +
         -- Check if customer loyalty record exists                              +
         SELECT EXISTS(                                                          +
             SELECT 1 FROM customer_loyalty                                      +
             WHERE business_id = v_business_id AND customer_id = v_customer_id   +
         ) INTO v_loyalty_exists;                                                +
                                                                                 +
         IF v_loyalty_exists THEN                                                +
             -- Update existing loyalty record and get new balance               +
             UPDATE customer_loyalty                                             +
             SET                                                                 +
                 total_points = total_points + v_new_points,                     +
                 current_points = current_points + v_new_points,                 +
                 total_spent = total_spent + v_final_amount,                     +
                 visit_count = visit_count + 1,                                  +
                 last_visit_date = NOW(),                                        +
                 updated_at = NOW()                                              +
             WHERE business_id = v_business_id AND customer_id = v_customer_id   +
             RETURNING current_points INTO v_current_points;                     +
         ELSE                                                                    +
             -- Create new loyalty record                                        +
             INSERT INTO customer_loyalty (                                      +
                 business_id, customer_id, total_points, current_points,         +
                 total_spent, visit_count, last_visit_date                       +
             ) VALUES (                                                          +
                 v_business_id, v_customer_id, v_new_points, v_new_points,       +
                 v_final_amount, 1, NOW()                                        +
             )                                                                   +
             RETURNING current_points INTO v_current_points;                     +
         END IF;                                                                 +
                                                                                 +
         -- Record loyalty transaction (balance_after will never be null now)    +
         INSERT INTO loyalty_transactions (                                      +
             business_id, customer_id, transaction_type, points,                 +
             balance_after, reference_type, reference_id, description            +
         )                                                                       +
         VALUES (                                                                +
             v_business_id,                                                      +
             v_customer_id,                                                      +
             'earn',                                                             +
             v_new_points,                                                       +
             v_current_points, -- This will always have a value now              +
             'pos_transaction',                                                  +
             p_pos_transaction_id,                                               +
             'Points earned from purchase'                                       +
         );                                                                      +
     END IF;                                                                     +
                                                                                 +
     RETURN QUERY SELECT true, 'POS sale processed successfully';                +
 END;                                                                            +
 
(1 row)

