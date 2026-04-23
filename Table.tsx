CREATE PROCEDURE RPT.PR_TEST_DEMO
(
    IN p_product_type VARCHAR(2),
    IN p_deal_type    VARCHAR(2)
)
SPECIFIC PR_TEST_DEMO
LANGUAGE SQL
RESULT SETS 0
BEGIN

    -------------------------------------------------------------------------
    -- Variable declaration
    -------------------------------------------------------------------------
    DECLARE lv_msg_category            VARCHAR(30)  DEFAULT 'ARG';
    DECLARE lv_procedure_name          VARCHAR(100) DEFAULT 'RPT.PR_TEST_DEMO';
    DECLARE lv_err_pos                 VARCHAR(1000);
    DECLARE lv_message_text            VARCHAR(1024);
    DECLARE lv_error_message           VARCHAR(3000);
    DECLARE lv_sqlstate                CHAR(5) DEFAULT '00000';
    DECLARE lv_region_code             VARCHAR(3);
    DECLARE lv_month_flag              CHAR(1);
    DECLARE lv_source_system           VARCHAR(10) DEFAULT 'STO';
    DECLARE lv_process_status          VARCHAR(20) DEFAULT 'START';
    DECLARE lv_batch_comment           VARCHAR(500);
    DECLARE lv_row_count               INTEGER DEFAULT 0;
    DECLARE lv_insert_count            INTEGER DEFAULT 0;
    DECLARE lv_update_count            INTEGER DEFAULT 0;
    DECLARE lv_merge_count             INTEGER DEFAULT 0;
    DECLARE lv_has_data                SMALLINT DEFAULT 0;

    DECLARE ld_biz_date                DATE;
    DECLARE ld_last_biz_date           DATE;
    DECLARE ld_next_biz_date           DATE;
    DECLARE ld_actual_month_begin_date DATE;
    DECLARE ld_actual_month_end_date   DATE;
    DECLARE ld_end_date                DATE;

    DECLARE ln_sqlcode                 INT DEFAULT 0;

    -------------------------------------------------------------------------
    -- Cursor variables
    -------------------------------------------------------------------------
    DECLARE cv_customer_number         VARCHAR(30);
    DECLARE cv_sub_account_number      VARCHAR(30);
    DECLARE cv_deal_number             VARCHAR(30);
    DECLARE cv_deal_sub_number         VARCHAR(30);
    DECLARE cv_event_id                VARCHAR(100);
    DECLARE cv_sequence_number         BIGINT;
    DECLARE cv_premium_amount          DECIMAL(31,10);
    DECLARE cv_settlement_amount       DECIMAL(31,10);
    DECLARE cv_trade_ccy               VARCHAR(10);
    DECLARE cv_settlement_ccy          VARCHAR(10);
    DECLARE cv_option_style            VARCHAR(10);
    DECLARE cv_expiry_date             DATE;
    DECLARE cv_exercise_date           DATE;
    DECLARE cv_knock_in_flag           CHAR(1);
    DECLARE cv_knock_out_flag          CHAR(1);

    DECLARE at_end                     SMALLINT DEFAULT 0;

    -------------------------------------------------------------------------
    -- Temporary table
    -------------------------------------------------------------------------
    DECLARE GLOBAL TEMPORARY TABLE SESSION.TMP_STO_EVENT_SOURCE
    (
        CUSTOMER_NUMBER        VARCHAR(30),
        SUB_ACCOUNT_NUMBER     VARCHAR(30),
        DEAL_NUMBER            VARCHAR(30),
        DEAL_SUB_NUMBER        VARCHAR(30),
        PRODUCT_TYPE           VARCHAR(2),
        DEAL_TYPE              VARCHAR(2),
        EVENT_CLASS            VARCHAR(10),
        EVENT_DATE             DATE,
        EVENT_ID               VARCHAR(100),
        PREMIUM_AMOUNT         DECIMAL(31,10),
        SETTLEMENT_AMOUNT      DECIMAL(31,10),
        TRADE_CCY              VARCHAR(10),
        SETTLEMENT_CCY         VARCHAR(10),
        OPTION_STYLE           VARCHAR(10),
        STRIKE_PRICE           DECIMAL(31,10),
        NOTIONAL_AMOUNT        DECIMAL(31,10),
        KNOCK_IN_FLAG          CHAR(1),
        KNOCK_OUT_FLAG         CHAR(1),
        EXPIRY_DATE            DATE,
        EXERCISE_DATE          DATE,
        COMPANY_CODE           VARCHAR(20),
        BRANCH_CODE            VARCHAR(20)
    )
    WITH REPLACE
    ON COMMIT PRESERVE ROWS
    NOT LOGGED;

    -------------------------------------------------------------------------
    -- Exception handling
    -------------------------------------------------------------------------
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        SET ln_sqlcode = SQLCODE;
        SET lv_sqlstate = SQLSTATE;

        GET DIAGNOSTICS EXCEPTION 1 lv_message_text = MESSAGE_TEXT;
        GET DIAGNOSTICS lv_row_count = ROW_COUNT;

        ROLLBACK;

        SET lv_error_message =
              lv_procedure_name || ' failed.'
           || ' Product Type: ' || COALESCE(p_product_type, '')
           || ' Deal Type: '    || COALESCE(p_deal_type, '')
           || ' Err Pos: '      || COALESCE(lv_err_pos, '')
           || ' Message: '      || COALESCE(lv_message_text, '')
           || ' SQLSTATE: '     || COALESCE(lv_sqlstate, '')
           || ' SQLCODE: '      || CHAR(ln_sqlcode)
           || ' ROW_COUNT: '    || CHAR(lv_row_count);

        CALL TEMP.PR_PROCEDURE_LOG(
            lv_msg_category,
            lv_procedure_name,
            'ERROR',
            lv_error_message
        );

        COMMIT;
    END;

    -------------------------------------------------------------------------
    -- Continue handler for cursor end
    -------------------------------------------------------------------------
    DECLARE CONTINUE HANDLER FOR NOT FOUND
        SET at_end = 1;

    -------------------------------------------------------------------------
    -- Cursor declaration
    -------------------------------------------------------------------------
    DECLARE c_event_detail CURSOR FOR
        SELECT MAST.CUSTOMER_NUMBER,
               MAST.SUB_ACCOUNT_NUMBER,
               MAST.DEAL_NUMBER,
               MAST.DEAL_SUB_NUMBER,
               MAST.EVENT_ID,
               MAST.SEQUENCE_NUMBER,
               SRC.PREMIUM_AMOUNT,
               SRC.SETTLEMENT_AMOUNT,
               SRC.TRADE_CCY,
               SRC.SETTLEMENT_CCY,
               SRC.OPTION_STYLE,
               SRC.EXPIRY_DATE,
               SRC.EXERCISE_DATE,
               SRC.KNOCK_IN_FLAG,
               SRC.KNOCK_OUT_FLAG
          FROM TEMP.TEST_EVENT_MASTER_P MAST
          INNER JOIN SESSION.TMP_STO_EVENT_SOURCE SRC
            ON SRC.CUSTOMER_NUMBER    = MAST.CUSTOMER_NUMBER
           AND SRC.SUB_ACCOUNT_NUMBER = MAST.SUB_ACCOUNT_NUMBER
           AND SRC.DEAL_NUMBER        = MAST.DEAL_NUMBER
           AND SRC.DEAL_SUB_NUMBER    = MAST.DEAL_SUB_NUMBER
           AND SRC.EVENT_ID           = MAST.EVENT_ID
         WHERE MAST.PRODUCT_TYPE      = p_product_type
           AND MAST.DEAL_TYPE         = p_deal_type
           AND MAST.CREATION_DATE     = ld_biz_date
           AND MAST.EVENT_ID LIKE 'OTC_STO_%';

    -------------------------------------------------------------------------
    -- Start log
    -------------------------------------------------------------------------
    CALL TEMP.PR_PROCEDURE_LOG(
        lv_msg_category,
        lv_procedure_name,
        'INFO',
        'Start CALL RPT.PR_TEST_DEMO()'
    );

    -------------------------------------------------------------------------
    -- Get business date / parameters
    -------------------------------------------------------------------------
    SET lv_err_pos = 'Position: Get business date and control parameters';

    SELECT BIZ_DT,
           PREV_BIZ_DT,
           NEXT_BIZ_DT,
           MONTH_FLAG,
           REGION_CD
      INTO ld_biz_date,
           ld_last_biz_date,
           ld_next_biz_date,
           lv_month_flag,
           lv_region_code
      FROM TEMP.SYS_WHERE
     WHERE SYS_CD = 'FOS';

    SET ld_actual_month_begin_date = TEMP.FN_GET_ACTUAL_MONTH_BEGIN_DATE();
    SET ld_actual_month_end_date   = TEMP.FN_GET_ACTUAL_MONTH_END_DATE();

    SET ld_end_date =
        CASE
            WHEN lv_month_flag = 'E' THEN ld_actual_month_end_date
            ELSE ld_biz_date
        END;

    SET lv_batch_comment =
          'biz_date=' || CHAR(ld_biz_date)
       || ', prev_biz_date=' || CHAR(ld_last_biz_date)
       || ', next_biz_date=' || CHAR(ld_next_biz_date)
       || ', region=' || COALESCE(lv_region_code, '')
       || ', month_flag=' || COALESCE(lv_month_flag, '');

    CALL TEMP.PR_PROCEDURE_LOG(
        lv_msg_category,
        lv_procedure_name,
        'INFO',
        lv_batch_comment
    );

    -------------------------------------------------------------------------
    -- Clean temp table
    -------------------------------------------------------------------------
    SET lv_err_pos = 'Position: Clean temp table';

    DELETE FROM SESSION.TMP_STO_EVENT_SOURCE;

    -------------------------------------------------------------------------
    -- Clear old data for rerun
    -------------------------------------------------------------------------
    SET lv_err_pos = 'Position: Clear rerun data';

    DELETE FROM TEMP.TEST_EVENT_DETAIL_P DETL
     WHERE DETL.PRODUCT_TYPE   = p_product_type
       AND DETL.DEAL_TYPE      = p_deal_type
       AND DETL.CREATION_DATE  = ld_biz_date
       AND DETL.EVENT_ID LIKE 'OTC_STO_%';

    DELETE FROM TEMP.TEST_EVENT_MASTER_P MAST
     WHERE MAST.PRODUCT_TYPE   = p_product_type
       AND MAST.DEAL_TYPE      = p_deal_type
       AND MAST.CREATION_DATE  = ld_biz_date
       AND MAST.EVENT_ID LIKE 'OTC_STO_%';

    COMMIT;

    CALL TEMP.PR_PROCEDURE_LOG(
        lv_msg_category,
        lv_procedure_name,
        'INFO',
        'Old rerun data deleted'
    );

    -------------------------------------------------------------------------
    -- Load source events into temp table
    -------------------------------------------------------------------------
    SET lv_err_pos = 'Position: Load source event rows into temp table';

    INSERT INTO SESSION.TMP_STO_EVENT_SOURCE
    (
        CUSTOMER_NUMBER,
        SUB_ACCOUNT_NUMBER,
        DEAL_NUMBER,
        DEAL_SUB_NUMBER,
        PRODUCT_TYPE,
        DEAL_TYPE,
        EVENT_CLASS,
        EVENT_DATE,
        EVENT_ID,
        PREMIUM_AMOUNT,
        SETTLEMENT_AMOUNT,
        TRADE_CCY,
        SETTLEMENT_CCY,
        OPTION_STYLE,
        STRIKE_PRICE,
        NOTIONAL_AMOUNT,
        KNOCK_IN_FLAG,
        KNOCK_OUT_FLAG,
        EXPIRY_DATE,
        EXERCISE_DATE,
        COMPANY_CODE,
        BRANCH_CODE
    )
    SELECT DEAL.CUSTOMER_NUMBER,
           DEAL.SUB_ACCOUNT_NUMBER,
           DEAL.DEAL_NUMBER,
           DEAL.DEAL_SUB_NUMBER,
           DEAL.PROD_TYPE,
           DEAL.DEAL_TYPE,
           CASE
               WHEN DEAL.TRADE_DATE = ld_biz_date THEN 'TRADE'
               WHEN DEAL.PREMIUM_DATE = ld_biz_date THEN 'PREMIUM'
               WHEN DEAL.EXERCISE_DATE = ld_biz_date AND DEAL.EXERCISED_FLAG = 'Y' THEN 'EXERCISE'
               WHEN DEAL.EXPIRY_DATE = ld_biz_date AND COALESCE(DEAL.EXERCISED_FLAG, 'N') = 'N' THEN 'EXPIRY'
               WHEN DEAL.MATURITY_DATE = ld_biz_date THEN 'MATURITY'
               ELSE 'OTHER'
           END,
           CASE
               WHEN DEAL.TRADE_DATE = ld_biz_date THEN DEAL.TRADE_DATE
               WHEN DEAL.PREMIUM_DATE = ld_biz_date THEN DEAL.PREMIUM_DATE
               WHEN DEAL.EXERCISE_DATE = ld_biz_date THEN DEAL.EXERCISE_DATE
               WHEN DEAL.EXPIRY_DATE = ld_biz_date THEN DEAL.EXPIRY_DATE
               ELSE DEAL.MATURITY_DATE
           END,
           CASE
               WHEN DEAL.TRADE_DATE = ld_biz_date AND DEAL.BUY_SELL_FLAG = 'B'
                    THEN 'OTC_STO_PURCHASE_TRADE_DATE'
               WHEN DEAL.TRADE_DATE = ld_biz_date AND DEAL.BUY_SELL_FLAG = 'S'
                    THEN 'OTC_STO_WRITTEN_TRADE_DATE'
               WHEN DEAL.PREMIUM_DATE = ld_biz_date AND DEAL.BUY_SELL_FLAG = 'B'
                    THEN 'OTC_STO_PURCHASE_PREMIUM_DATE'
               WHEN DEAL.PREMIUM_DATE = ld_biz_date AND DEAL.BUY_SELL_FLAG = 'S'
                    THEN 'OTC_STO_WRITTEN_PREMIUM_DATE'
               WHEN DEAL.EXERCISE_DATE = ld_biz_date AND DEAL.EXERCISED_FLAG = 'Y'
                    THEN 'OTC_STO_EXERCISE_DATE'
               WHEN DEAL.EXPIRY_DATE = ld_biz_date AND COALESCE(DEAL.EXERCISED_FLAG, 'N') = 'N'
                    THEN 'OTC_STO_EXPIRY_DATE'
               WHEN DEAL.MATURITY_DATE = ld_biz_date AND DEAL.BUY_SELL_FLAG = 'B'
                    THEN 'OTC_STO_PURCHASE_MATURITY_DATE'
               ELSE 'OTC_STO_WRITTEN_MATURITY_DATE'
           END,
           DEAL.PREMIUM_AMOUNT,
           CASE
               WHEN POSN.CLOSE_OUT_AMOUNT IS NOT NULL THEN POSN.CLOSE_OUT_AMOUNT
               WHEN DEAL.SETTLEMENT_AMOUNT IS NOT NULL THEN DEAL.SETTLEMENT_AMOUNT
               ELSE 0
           END,
           DEAL.TRADE_CCY,
           DEAL.SETTLEMENT_CCY,
           DEAL.OPTION_STYLE,
           DEAL.STRIKE_PRICE,
           DEAL.NOTIONAL_AMOUNT,
           COALESCE(DEAL.KNOCK_IN_FLAG, 'N'),
           COALESCE(DEAL.KNOCK_OUT_FLAG, 'N'),
           DEAL.EXPIRY_DATE,
           DEAL.EXERCISE_DATE,
           DEAL.COMPANY_CODE,
           DEAL.BRANCH_CODE
      FROM TEMP.STRUCTURED_OPTION_DEAL_BEF_EOD DEAL
      LEFT OUTER JOIN TEMP.OTC_STO_POSITION POSN
        ON POSN.CUSTOMER_NUMBER    = DEAL.CUSTOMER_NUMBER
       AND POSN.SUB_ACCOUNT_NUMBER = DEAL.SUB_ACCOUNT_NUMBER
       AND POSN.DEAL_TYPE          = DEAL.DEAL_TYPE
       AND POSN.DEAL_NUMBER        = DEAL.DEAL_NUMBER
       AND POSN.DEAL_SUB_NUMBER    = DEAL.DEAL_SUB_NUMBER
      LEFT OUTER JOIN TEMP.STRUCTURED_OPTION_TEMPLATE TMPL
        ON TMPL.TEMPLATE_CODE      = DEAL.TEMPLATE_CODE
     WHERE DEAL.PROD_TYPE          = p_product_type
       AND DEAL.DEAL_TYPE          = p_deal_type
       AND DEAL.REVERSE_TS IS NULL
       AND DEAL.STATUS IN ('A', 'L', 'P')
       AND TMPL.TEMPLATE_CODE IS NOT NULL
       AND
       (
            DEAL.TRADE_DATE     = ld_biz_date
         OR DEAL.PREMIUM_DATE   = ld_biz_date
         OR DEAL.EXERCISE_DATE  = ld_biz_date
         OR DEAL.EXPIRY_DATE    = ld_biz_date
         OR DEAL.MATURITY_DATE  = ld_biz_date
       );

    GET DIAGNOSTICS lv_row_count = ROW_COUNT;
    SET lv_insert_count = lv_insert_count + lv_row_count;

    COMMIT;

    -------------------------------------------------------------------------
    -- Check if data exists
    -------------------------------------------------------------------------
    SET lv_err_pos = 'Position: Check temp source data';

    SELECT CASE WHEN EXISTS (SELECT 1 FROM SESSION.TMP_STO_EVENT_SOURCE) THEN 1 ELSE 0 END
      INTO lv_has_data
      FROM SYSIBM.SYSDUMMY1;

    IF lv_has_data = 0 THEN

        CALL TEMP.PR_PROCEDURE_LOG(
            lv_msg_category,
            lv_procedure_name,
            'INFO',
            'No source rows found for structured option events'
        );

    ELSE

        ---------------------------------------------------------------------
        -- Insert ACCOUNT_EVENT_MASTER_P
        ---------------------------------------------------------------------
        SET lv_err_pos = 'Position: Insert ACCOUNT_EVENT_MASTER_P';

        INSERT INTO TEMP.TEST_EVENT_MASTER_P
        (
            ACTIVE_FLAG,
            CREATION_DATE,
            AS_OF_DATE,
            PRODUCT_TYPE,
            DEAL_TYPE,
            EVENT_ID,
            SEQUENCE_NUMBER,
            DEAL_WITH_COMPANY,
            DEAL_WITH_BRANCH,
            CUSTOMER_NUMBER,
            SUB_ACCOUNT_NUMBER,
            DEAL_NUMBER,
            DEAL_SUB_NUMBER
        )
        SELECT 'A',
               ld_biz_date,
               ld_biz_date,
               SRC.PRODUCT_TYPE,
               SRC.DEAL_TYPE,
               SRC.EVENT_ID,
               NEXT VALUE FOR RPT.GLOBAL_SEQ_ACCOUNT_EVENT_UNIQUE_ID,
               SRC.COMPANY_CODE,
               SRC.BRANCH_CODE,
               SRC.CUSTOMER_NUMBER,
               SRC.SUB_ACCOUNT_NUMBER,
               SRC.DEAL_NUMBER,
               SRC.DEAL_SUB_NUMBER
          FROM SESSION.TMP_STO_EVENT_SOURCE SRC;

        GET DIAGNOSTICS lv_row_count = ROW_COUNT;
        SET lv_insert_count = lv_insert_count + lv_row_count;

        COMMIT;

        ---------------------------------------------------------------------
        -- Insert static detail rows
        ---------------------------------------------------------------------
        SET lv_err_pos = 'Position: Insert static detail rows';

        INSERT INTO TEMP.TEST_EVENT_DETAIL_P
        (
            ACTIVE_FLAG,
            CREATION_DATE,
            AS_OF_DATE,
            PRODUCT_TYPE,
            DEAL_TYPE,
            EVENT_ID,
            SEQUENCE_NUMBER,
            FIELD_NAME,
            FIELD_VALUE
        )
        SELECT MAST.ACTIVE_FLAG,
               ld_biz_date,
               MAST.AS_OF_DATE,
               MAST.PRODUCT_TYPE,
               MAST.DEAL_TYPE,
               MAST.EVENT_ID,
               MAST.SEQUENCE_NUMBER,
               'SOURCE_SYSTEM',
               lv_source_system
          FROM TEMP.TEST_EVENT_MASTER_P MAST
         WHERE MAST.PRODUCT_TYPE  = p_product_type
           AND MAST.DEAL_TYPE     = p_deal_type
           AND MAST.CREATION_DATE = ld_biz_date
           AND MAST.EVENT_ID LIKE 'OTC_STO_%';

        GET DIAGNOSTICS lv_row_count = ROW_COUNT;
        SET lv_insert_count = lv_insert_count + lv_row_count;

        INSERT INTO TEMP.TEST_EVENT_DETAIL_P
        (
            ACTIVE_FLAG,
            CREATION_DATE,
            AS_OF_DATE,
            PRODUCT_TYPE,
            DEAL_TYPE,
            EVENT_ID,
            SEQUENCE_NUMBER,
            FIELD_NAME,
            FIELD_VALUE
        )
        SELECT MAST.ACTIVE_FLAG,
               ld_biz_date,
               MAST.AS_OF_DATE,
               MAST.PRODUCT_TYPE,
               MAST.DEAL_TYPE,
               MAST.EVENT_ID,
               MAST.SEQUENCE_NUMBER,
               'REGION_CODE',
               COALESCE(lv_region_code, '')
          FROM TEMP.TEST_EVENT_MASTER_P MAST
         WHERE MAST.PRODUCT_TYPE  = p_product_type
           AND MAST.DEAL_TYPE     = p_deal_type
           AND MAST.CREATION_DATE = ld_biz_date
           AND MAST.EVENT_ID LIKE 'OTC_STO_%';

        GET DIAGNOSTICS lv_row_count = ROW_COUNT;
        SET lv_insert_count = lv_insert_count + lv_row_count;

        COMMIT;

        ---------------------------------------------------------------------
        -- Insert detail rows using cursor
        ---------------------------------------------------------------------
        SET lv_err_pos = 'Position: Insert dynamic detail rows by cursor';

        SET at_end = 0;
        OPEN c_event_detail;

        fetch_loop:
        LOOP
            FETCH c_event_detail
             INTO cv_customer_number,
                  cv_sub_account_number,
                  cv_deal_number,
                  cv_deal_sub_number,
                  cv_event_id,
                  cv_sequence_number,
                  cv_premium_amount,
                  cv_settlement_amount,
                  cv_trade_ccy,
                  cv_settlement_ccy,
                  cv_option_style,
                  cv_expiry_date,
                  cv_exercise_date,
                  cv_knock_in_flag,
                  cv_knock_out_flag;

            IF at_end = 1 THEN
                LEAVE fetch_loop;
            END IF;

            INSERT INTO TEMP.TEST_EVENT_DETAIL_P
            (
                ACTIVE_FLAG,
                CREATION_DATE,
                AS_OF_DATE,
                PRODUCT_TYPE,
                DEAL_TYPE,
                EVENT_ID,
                SEQUENCE_NUMBER,
                FIELD_NAME,
                FIELD_VALUE
            )
            VALUES
            (
                'A',
                ld_biz_date,
                ld_biz_date,
                p_product_type,
                p_deal_type,
                cv_event_id,
                cv_sequence_number,
                'PREMIUM_AMOUNT',
                COALESCE(CHAR(cv_premium_amount), '0')
            );

            INSERT INTO TEMP.TEST_EVENT_DETAIL_P
            (
                ACTIVE_FLAG,
                CREATION_DATE,
                AS_OF_DATE,
                PRODUCT_TYPE,
                DEAL_TYPE,
                EVENT_ID,
                SEQUENCE_NUMBER,
                FIELD_NAME,
                FIELD_VALUE
            )
            VALUES
            (
                'A',
                ld_biz_date,
                ld_biz_date,
                p_product_type,
                p_deal_type,
                cv_event_id,
                cv_sequence_number,
                'SETTLEMENT_AMOUNT',
                COALESCE(CHAR(cv_settlement_amount), '0')
            );

            INSERT INTO TEMP.TEST_EVENT_DETAIL_P
            (
                ACTIVE_FLAG,
                CREATION_DATE,
                AS_OF_DATE,
                PRODUCT_TYPE,
                DEAL_TYPE,
                EVENT_ID,
                SEQUENCE_NUMBER,
                FIELD_NAME,
                FIELD_VALUE
            )
            VALUES
            (
                'A',
                ld_biz_date,
                ld_biz_date,
                p_product_type,
                p_deal_type,
                cv_event_id,
                cv_sequence_number,
                'TRADE_CCY',
                COALESCE(cv_trade_ccy, '')
            );

            INSERT INTO TEMP.TEST_EVENT_DETAIL_P
            (
                ACTIVE_FLAG,
                CREATION_DATE,
                AS_OF_DATE,
                PRODUCT_TYPE,
                DEAL_TYPE,
                EVENT_ID,
                SEQUENCE_NUMBER,
                FIELD_NAME,
                FIELD_VALUE
            )
            VALUES
            (
                'A',
                ld_biz_date,
                ld_biz_date,
                p_product_type,
                p_deal_type,
                cv_event_id,
                cv_sequence_number,
                'SETTLEMENT_CCY',
                COALESCE(cv_settlement_ccy, '')
            );

            INSERT INTO TEMP.TEST_EVENT_DETAIL_P
            (
                ACTIVE_FLAG,
                CREATION_DATE,
                AS_OF_DATE,
                PRODUCT_TYPE,
                DEAL_TYPE,
                EVENT_ID,
                SEQUENCE_NUMBER,
                FIELD_NAME,
                FIELD_VALUE
            )
            VALUES
            (
                'A',
                ld_biz_date,
                ld_biz_date,
                p_product_type,
                p_deal_type,
                cv_event_id,
                cv_sequence_number,
                'OPTION_STYLE',
                COALESCE(cv_option_style, '')
            );

            INSERT INTO TEMP.TEST_EVENT_DETAIL_P
            (
                ACTIVE_FLAG,
                CREATION_DATE,
                AS_OF_DATE,
                PRODUCT_TYPE,
                DEAL_TYPE,
                EVENT_ID,
                SEQUENCE_NUMBER,
                FIELD_NAME,
                FIELD_VALUE
            )
            VALUES
            (
                'A',
                ld_biz_date,
                ld_biz_date,
                p_product_type,
                p_deal_type,
                cv_event_id,
                cv_sequence_number,
                'KNOCK_IN_FLAG',
                COALESCE(cv_knock_in_flag, 'N')
            );

            INSERT INTO TEMP.TEST_EVENT_DETAIL_P
            (
                ACTIVE_FLAG,
                CREATION_DATE,
                AS_OF_DATE,
                PRODUCT_TYPE,
                DEAL_TYPE,
                EVENT_ID,
                SEQUENCE_NUMBER,
                FIELD_NAME,
                FIELD_VALUE
            )
            VALUES
            (
                'A',
                ld_biz_date,
                ld_biz_date,
                p_product_type,
                p_deal_type,
                cv_event_id,
                cv_sequence_number,
                'KNOCK_OUT_FLAG',
                COALESCE(cv_knock_out_flag, 'N')
            );

            INSERT INTO TEMP.TEST_EVENT_DETAIL_P
            (
                ACTIVE_FLAG,
                CREATION_DATE,
                AS_OF_DATE,
                PRODUCT_TYPE,
                DEAL_TYPE,
                EVENT_ID,
                SEQUENCE_NUMBER,
                FIELD_NAME,
                FIELD_VALUE
            )
            VALUES
            (
                'A',
                ld_biz_date,
                ld_biz_date,
                p_product_type,
                p_deal_type,
                cv_event_id,
                cv_sequence_number,
                'EXPIRY_DATE',
                CASE WHEN cv_expiry_date IS NULL THEN '' ELSE CHAR(cv_expiry_date) END
            );

            INSERT INTO TEMP.TEST_EVENT_DETAIL_P
            (
                ACTIVE_FLAG,
                CREATION_DATE,
                AS_OF_DATE,
                PRODUCT_TYPE,
                DEAL_TYPE,
                EVENT_ID,
                SEQUENCE_NUMBER,
                FIELD_NAME,
                FIELD_VALUE
            )
            VALUES
            (
                'A',
                ld_biz_date,
                ld_biz_date,
                p_product_type,
                p_deal_type,
                cv_event_id,
                cv_sequence_number,
                'EXERCISE_DATE',
                CASE WHEN cv_exercise_date IS NULL THEN '' ELSE CHAR(cv_exercise_date) END
            );

            SET lv_insert_count = lv_insert_count + 9;
        END LOOP;

        CLOSE c_event_detail;

        COMMIT;

        ---------------------------------------------------------------------
        -- Update original deal number and deal sub number from SOD
        ---------------------------------------------------------------------
        SET lv_err_pos = 'Position: Update original deal number from SOD';

        UPDATE TEMP.TEST_EVENT_MASTER_P MAST
           SET (MAST.DEAL_NUMBER, MAST.DEAL_SUB_NUMBER) =
               (
                   SELECT SOD.ORIG_DEAL_NUM,
                          SOD.ORIG_DEAL_SB_NUM
                     FROM TEMP.STRUCTURED_OPTION_SOD SOD
                    WHERE SOD.CUST_NUM    = MAST.CUSTOMER_NUMBER
                      AND SOD.SB_ACCT_NUM = MAST.SUB_ACCOUNT_NUMBER
                      AND SOD.DEAL_NUM    = MAST.DEAL_NUMBER
                      AND SOD.DEAL_SB_NUM = MAST.DEAL_SUB_NUMBER
                    FETCH FIRST 1 ROW ONLY
               )
         WHERE MAST.PRODUCT_TYPE  = p_product_type
           AND MAST.DEAL_TYPE     = p_deal_type
           AND MAST.CREATION_DATE = ld_biz_date
           AND MAST.EVENT_ID LIKE 'OTC_STO_%'
           AND EXISTS
               (
                   SELECT 1
                     FROM TEMP.STRUCTURED_OPTION_SOD SOD
                    WHERE SOD.CUST_NUM    = MAST.CUSTOMER_NUMBER
                      AND SOD.SB_ACCT_NUM = MAST.SUB_ACCOUNT_NUMBER
                      AND SOD.DEAL_NUM    = MAST.DEAL_NUMBER
                      AND SOD.DEAL_SB_NUM = MAST.DEAL_SUB_NUMBER
               );

        GET DIAGNOSTICS lv_row_count = ROW_COUNT;
        SET lv_update_count = lv_update_count + lv_row_count;

        COMMIT;

        ---------------------------------------------------------------------
        -- Merge summary information into summary table
        ---------------------------------------------------------------------
        SET lv_err_pos = 'Position: Merge into summary table';

        MERGE INTO TEMP.TEST_EVENT_DAILY_SUMMARY T
        USING
        (
            SELECT ld_biz_date AS BIZ_DATE,
                   p_product_type AS PRODUCT_TYPE,
                   p_deal_type AS DEAL_TYPE,
                   COUNT(*) AS EVENT_COUNT
              FROM TEMP.TEST_EVENT_MASTER_P MAST
             WHERE MAST.CREATION_DATE = ld_biz_date
               AND MAST.PRODUCT_TYPE  = p_product_type
               AND MAST.DEAL_TYPE     = p_deal_type
               AND MAST.EVENT_ID LIKE 'OTC_STO_%'
        ) S
        ON T.BIZ_DATE      = S.BIZ_DATE
       AND T.PRODUCT_TYPE  = S.PRODUCT_TYPE
       AND T.DEAL_TYPE     = S.DEAL_TYPE
        WHEN MATCHED THEN
            UPDATE SET
                T.EVENT_COUNT  = S.EVENT_COUNT,
                T.UPDATE_TS    = CURRENT TIMESTAMP,
                T.UPDATE_USER  = lv_procedure_name
        WHEN NOT MATCHED THEN
            INSERT
            (
                BIZ_DATE,
                PRODUCT_TYPE,
                DEAL_TYPE,
                EVENT_COUNT,
                CREATE_TS,
                CREATE_USER
            )
            VALUES
            (
                S.BIZ_DATE,
                S.PRODUCT_TYPE,
                S.DEAL_TYPE,
                S.EVENT_COUNT,
                CURRENT TIMESTAMP,
                lv_procedure_name
            );

        GET DIAGNOSTICS lv_row_count = ROW_COUNT;
        SET lv_merge_count = lv_merge_count + lv_row_count;

        COMMIT;

        ---------------------------------------------------------------------
        -- Additional detail rows for derived business flags
        ---------------------------------------------------------------------
        SET lv_err_pos = 'Position: Insert derived business detail rows';

        INSERT INTO TEMP.TEST_EVENT_DETAIL_P
        (
            ACTIVE_FLAG,
            CREATION_DATE,
            AS_OF_DATE,
            PRODUCT_TYPE,
            DEAL_TYPE,
            EVENT_ID,
            SEQUENCE_NUMBER,
            FIELD_NAME,
            FIELD_VALUE
        )
        SELECT 'A',
               ld_biz_date,
               ld_biz_date,
               p_product_type,
               p_deal_type,
               MAST.EVENT_ID,
               MAST.SEQUENCE_NUMBER,
               'MONTH_END_FLAG',
               CASE
                   WHEN lv_month_flag = 'E' THEN 'Y'
                   ELSE 'N'
               END
          FROM TEMP.TEST_EVENT_MASTER_P MAST
         WHERE MAST.CREATION_DATE = ld_biz_date
           AND MAST.PRODUCT_TYPE  = p_product_type
           AND MAST.DEAL_TYPE     = p_deal_type
           AND MAST.EVENT_ID LIKE 'OTC_STO_%';

        GET DIAGNOSTICS lv_row_count = ROW_COUNT;
        SET lv_insert_count = lv_insert_count + lv_row_count;

        INSERT INTO TEMP.TEST_EVENT_DETAIL_P
        (
            ACTIVE_FLAG,
            CREATION_DATE,
            AS_OF_DATE,
            PRODUCT_TYPE,
            DEAL_TYPE,
            EVENT_ID,
            SEQUENCE_NUMBER,
            FIELD_NAME,
            FIELD_VALUE
        )
        SELECT 'A',
               ld_biz_date,
               ld_biz_date,
               p_product_type,
               p_deal_type,
               MAST.EVENT_ID,
               MAST.SEQUENCE_NUMBER,
               'PROCESS_STATUS',
               lv_process_status
          FROM TEMP.TEST_EVENT_MASTER_P MAST
         WHERE MAST.CREATION_DATE = ld_biz_date
           AND MAST.PRODUCT_TYPE  = p_product_type
           AND MAST.DEAL_TYPE     = p_deal_type
           AND MAST.EVENT_ID LIKE 'OTC_STO_%';

        GET DIAGNOSTICS lv_row_count = ROW_COUNT;
        SET lv_insert_count = lv_insert_count + lv_row_count;

        COMMIT;

    END IF;

    -------------------------------------------------------------------------
    -- End log
    -------------------------------------------------------------------------
    SET lv_batch_comment =
          'Completed. inserted=' || CHAR(lv_insert_count)
       || ', updated=' || CHAR(lv_update_count)
       || ', merged=' || CHAR(lv_merge_count);

    CALL TEMP.PR_PROCEDURE_LOG(
        lv_msg_category,
        lv_procedure_name,
        'INFO',
        lv_batch_comment
    );

    CALL TEMP.PR_PROCEDURE_LOG(
        lv_msg_category,
        lv_procedure_name,
        'INFO',
        'End CALL RPT.PR_TEST_DEMO()'
    );

END
@

CREATE PROCEDURE TEMP.PR_EXTRACT_LOAN_RISK_DTL ()
LANGUAGE SQL
SPECIFIC PR_EXTRACT_LOAN_RISK_DTL
BEGIN

    /***************************************************************
    * 
    * ALL RIGHTS RESERVED.
    *
    * Procedure Name : TEMP.PR_EXTRACT_LOAN_RISK_DTL
    * Purpose        : Extract daily loan risk detail report
    * Author         : ChatGPT
    * Created On     : 2026-04-10
    *
    * Amendment History:
    * --------------------------------------------------------------
    * Amended By   Amended On   Description
    * -----------  -----------  ------------------------------------
    * ChatGPT      10 Apr 2026  Initial version
    ***************************************************************/

    ----------------------------------------------------------------
    -- Variable declarations
    ----------------------------------------------------------------
    DECLARE l_report_date           DATE;
    DECLARE l_next_business_date    DATE;
    DECLARE l_country_code          CHAR(2);
    DECLARE l_site_code             CHAR(5) DEFAULT '00000';
    DECLARE l_reporting_ccy         VARCHAR(3);
    DECLARE l_is_hk                 CHAR(1);
    DECLARE l_is_sg                 CHAR(1);
    DECLARE l_batch_id              VARCHAR(30);
    DECLARE l_sql_str               VARCHAR(2000);
    DECLARE l_ctrl_flag             CHAR(1) DEFAULT 'N';
    DECLARE l_row_cnt               INTEGER DEFAULT 0;
    DECLARE l_warn_msg              VARCHAR(1000);
    DECLARE l_err_msg               VARCHAR(1000);

    ----------------------------------------------------------------
    -- Exception handling
    ----------------------------------------------------------------
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS EXCEPTION 1 l_err_msg = MESSAGE_TEXT;

        CALL TEMP.PR_PROCEDURE_LOG(
              'FORMAT'
            , 'TEMP.PR_EXTRACT_LOAN_RISK_DTL'
            , 'ERROR'
            , COALESCE(l_err_msg, 'UNKNOWN SQL EXCEPTION')
        );

        ROLLBACK;
        RESIGNAL;
    END;

    DECLARE CONTINUE HANDLER FOR NOT FOUND
    BEGIN
        SET l_warn_msg = 'NOT FOUND CONDITION ENCOUNTERED';
        CALL TEMP.PR_PROCEDURE_LOG(
              'FORMAT'
            , 'TEMP.PR_EXTRACT_LOAN_RISK_DTL'
            , 'WARN'
            , l_warn_msg
        );
    END;

    ----------------------------------------------------------------
    -- Initialize runtime variables
    ----------------------------------------------------------------
    SET l_report_date        = CURRENT DATE - 1 DAY;
    SET l_next_business_date = CURRENT DATE;
    SET l_country_code       = 'HK';
    SET l_reporting_ccy      = 'HKD';
    SET l_is_hk              = 'Y';
    SET l_is_sg              = 'N';
    SET l_batch_id           = VARCHAR_FORMAT(CURRENT TIMESTAMP, 'YYYYMMDDHH24MISS');

    CALL TEMP.PR_PROCEDURE_LOG(
          'FORMAT'
        , 'TEMP.PR_EXTRACT_LOAN_RISK_DTL'
        , 'INFO'
        , 'Procedure started. Batch=' || l_batch_id
    );

    ----------------------------------------------------------------
    -- Read control / config flag
    ----------------------------------------------------------------
    SELECT COALESCE(MAX(ctrl_flag), 'N')
      INTO l_ctrl_flag
      FROM CFG.RPT_CONTROL
     WHERE process_name = 'PR_EXTRACT_LOAN_RISK_DTL';

    ----------------------------------------------------------------
    -- Clear target table
    ----------------------------------------------------------------
    SET l_sql_str =
        'ALTER TABLE RPT.RPT_LOAN_RISK_DTL ACTIVATE NOT LOGGED INITIALLY WITH EMPTY TABLE';

    EXECUTE IMMEDIATE l_sql_str;
    COMMIT;

    CALL TEMP.PR_PROCEDURE_LOG(
          'FORMAT'
        , 'TEMP.PR_EXTRACT_LOAN_RISK_DTL'
        , 'INFO'
        , 'Target table cleared'
    );

    ----------------------------------------------------------------
    -- Temporary table: base loan data
    ----------------------------------------------------------------
    DECLARE GLOBAL TEMPORARY TABLE SESSION.TMP_LOAN_BASE
    (
        CUST_NUM                VARCHAR(20)     NOT NULL,
        ACCT_NUM                VARCHAR(20)     NOT NULL,
        DEAL_NUM                DECIMAL(20,0)   NOT NULL,
        DEAL_SUB_NUM            DECIMAL(10,0)   NOT NULL,
        DEAL_TYPE               VARCHAR(5)      NOT NULL,
        LOAN_CCY                VARCHAR(3)      NOT NULL,
        CURR_BAL                DECIMAL(18,2),
        BREAK_INT_AMT           DECIMAL(18,2),
        MATURITY_DATE           DATE,
        RESP_COMP_CDE           VARCHAR(5),
        COUNTRY_CODE            CHAR(2),
        GUARANTEE_IND           CHAR(1),
        RISK_RATING             DECIMAL(10,4),
        PD                      DECIMAL(10,6),
        LGD                     DECIMAL(10,6),
        SOURCE_SYSTEM_ID        VARCHAR(20)
    )
    ON COMMIT PRESERVE ROWS NOT LOGGED WITH REPLACE;

    INSERT INTO SESSION.TMP_LOAN_BASE
    SELECT
          l.CUST_NUM
        , l.ACCT_NUM
        , l.DEAL_NUM
        , l.DEAL_SUB_NUM
        , l.DEAL_TYPE
        , l.LOAN_CCY
        , l.CURR_BAL
        , COALESCE(l.BREAK_INT_AMT, 0)
        , l.MATURITY_DATE
        , l.RESP_COMP_CDE
        , l.COUNTRY_CODE
        , CASE WHEN g.DEAL_NUM IS NOT NULL THEN 'Y' ELSE 'N' END AS GUARANTEE_IND
        , COALESCE(rr.CUST_RISK_RATING, 0)
        , COALESCE(rr.PD, 0)
        , COALESCE(rr.LGD, 0)
        , l.SOURCE_SYSTEM_ID
    FROM INTERFACE.LOAN_DEAL l
    LEFT JOIN INTERFACE.GUARANTEE_DEAL g
           ON l.CUST_NUM     = g.CUST_NUM
          AND l.ACCT_NUM     = g.ACCT_NUM
          AND l.DEAL_NUM     = g.DEAL_NUM
          AND l.DEAL_SUB_NUM = g.DEAL_SUB_NUM
    LEFT JOIN INTERFACE.CUST_RISK_RATING rr
           ON l.CUST_NUM = rr.CUST_NUM
    WHERE l.ACTV_FLAG = 'A'
      AND COALESCE(l.CURR_BAL, 0) <> 0
      AND l.MATURITY_DATE >= l_report_date;

    GET DIAGNOSTICS l_row_cnt = ROW_COUNT;

    CALL TEMP.PR_PROCEDURE_LOG(
          'FORMAT'
        , 'TEMP.PR_EXTRACT_LOAN_RISK_DTL'
        , 'INFO'
        , 'TMP_LOAN_BASE inserted rows=' || CHAR(l_row_cnt)
    );

    ----------------------------------------------------------------
    -- Temporary table: exchange rate
    ----------------------------------------------------------------
    DECLARE GLOBAL TEMPORARY TABLE SESSION.TMP_FX_RATE
    (
        FROM_CCY       VARCHAR(3)    NOT NULL,
        TO_CCY         VARCHAR(3)    NOT NULL,
        RATE_DATE      DATE          NOT NULL,
        EXCH_RATE      DECIMAL(18,8) NOT NULL
    )
    ON COMMIT PRESERVE ROWS NOT LOGGED WITH REPLACE;

    INSERT INTO SESSION.TMP_FX_RATE
    SELECT
          f.FROM_CCY
        , f.TO_CCY
        , f.RATE_DATE
        , f.EXCH_RATE
    FROM INTERFACE.FX_RATE f
    WHERE f.RATE_DATE = l_report_date
      AND f.TO_CCY = l_reporting_ccy;

    ----------------------------------------------------------------
    -- Temporary table: guarantee enrich
    ----------------------------------------------------------------
    DECLARE GLOBAL TEMPORARY TABLE SESSION.TMP_GUARANTEE
    (
        DEAL_NUM                DECIMAL(20,0) NOT NULL,
        DEAL_SUB_NUM            DECIMAL(10,0) NOT NULL,
        GUARANTEE_TYPE          VARCHAR(20),
        GUARANTEE_VALUE         DECIMAL(18,2),
        GUARANTEE_VALUE_RPT     DECIMAL(18,2),
        GUARANTEE_CCY           VARCHAR(3)
    )
    ON COMMIT PRESERVE ROWS NOT LOGGED WITH REPLACE;

    INSERT INTO SESSION.TMP_GUARANTEE
    SELECT
          g.DEAL_NUM
        , g.DEAL_SUB_NUM
        , g.GUARANTEE_TYPE
        , g.GUARANTEE_AMT
        , CASE
              WHEN g.GUARANTEE_CCY = l_reporting_ccy
                   THEN g.GUARANTEE_AMT
              ELSE ROUND(g.GUARANTEE_AMT * COALESCE(fx.EXCH_RATE, 1), 2)
          END AS GUARANTEE_VALUE_RPT
        , g.GUARANTEE_CCY
    FROM INTERFACE.GUARANTEE_DEAL g
    LEFT JOIN SESSION.TMP_FX_RATE fx
           ON g.GUARANTEE_CCY = fx.FROM_CCY
          AND fx.TO_CCY       = l_reporting_ccy
          AND fx.RATE_DATE    = l_report_date
    WHERE g.ACTV_FLAG = 'A';

    ----------------------------------------------------------------
    -- Temporary table: charge / fee detail
    ----------------------------------------------------------------
    DECLARE GLOBAL TEMPORARY TABLE SESSION.TMP_CHARGE
    (
        DEAL_NUM                DECIMAL(20,0) NOT NULL,
        DEAL_SUB_NUM            DECIMAL(10,0) NOT NULL,
        CHARGE_AMT              DECIMAL(18,2),
        CHARGE_AMT_RPT          DECIMAL(18,2)
    )
    ON COMMIT PRESERVE ROWS NOT LOGGED WITH REPLACE;

    INSERT INTO SESSION.TMP_CHARGE
    SELECT
          c.DEAL_NUM
        , c.DEAL_SUB_NUM
        , SUM(COALESCE(c.CHARGE_AMT, 0)) AS CHARGE_AMT
        , SUM(
            CASE
                WHEN c.CHARGE_CCY = l_reporting_ccy
                     THEN COALESCE(c.CHARGE_AMT, 0)
                ELSE ROUND(COALESCE(c.CHARGE_AMT, 0) * COALESCE(fx.EXCH_RATE, 1), 2)
            END
          ) AS CHARGE_AMT_RPT
    FROM INTERFACE.SEC_CHARGE_DEAL c
    LEFT JOIN SESSION.TMP_FX_RATE fx
           ON c.CHARGE_CCY = fx.FROM_CCY
          AND fx.TO_CCY    = l_reporting_ccy
          AND fx.RATE_DATE = l_report_date
    WHERE c.CHARGE_TYPE IN ('BROKER', 'TXN', 'COMM')
    GROUP BY c.DEAL_NUM, c.DEAL_SUB_NUM;

    ----------------------------------------------------------------
    -- Main insert into report table
    ----------------------------------------------------------------
    INSERT INTO RPT.RPT_LOAN_RISK_DTL
    (
        BATCH_ID,
        REPORT_DATE,
        CUST_NUM,
        ACCT_NUM,
        DEAL_NUM,
        DEAL_SUB_NUM,
        DEAL_TYPE,
        COUNTRY_CODE,
        SOURCE_SYSTEM_ID,
        LOAN_CCY,
        CURR_BAL,
        CURR_BAL_RPT,
        BREAK_INT_AMT,
        BREAK_INT_AMT_RPT,
        GUARANTEE_IND,
        GUARANTEE_TYPE,
        GUARANTEE_VALUE,
        GUARANTEE_VALUE_RPT,
        RISK_RATING,
        PD,
        LGD,
        EXPECTED_LOSS,
        EXPECTED_LOSS_RPT,
        CHARGE_AMT,
        CHARGE_AMT_RPT,
        MATURITY_DATE,
        LOAD_TS
    )
    SELECT
          l_batch_id
        , l_report_date
        , b.CUST_NUM
        , b.ACCT_NUM
        , b.DEAL_NUM
        , b.DEAL_SUB_NUM
        , b.DEAL_TYPE
        , b.COUNTRY_CODE
        , b.SOURCE_SYSTEM_ID
        , b.LOAN_CCY
        , b.CURR_BAL
        , CASE
              WHEN b.LOAN_CCY = l_reporting_ccy
                   THEN b.CURR_BAL
              ELSE ROUND(b.CURR_BAL * COALESCE(fx.EXCH_RATE, 1), 2)
          END AS CURR_BAL_RPT
        , b.BREAK_INT_AMT
        , CASE
              WHEN b.LOAN_CCY = l_reporting_ccy
                   THEN b.BREAK_INT_AMT
              ELSE ROUND(b.BREAK_INT_AMT * COALESCE(fx.EXCH_RATE, 1), 2)
          END AS BREAK_INT_AMT_RPT
        , b.GUARANTEE_IND
        , g.GUARANTEE_TYPE
        , g.GUARANTEE_VALUE
        , g.GUARANTEE_VALUE_RPT
        , b.RISK_RATING
        , b.PD
        , b.LGD
        , ROUND(COALESCE(b.CURR_BAL,0) * COALESCE(b.PD,0) * COALESCE(b.LGD,0), 2) AS EXPECTED_LOSS
        , ROUND(
            CASE
                WHEN b.LOAN_CCY = l_reporting_ccy
                     THEN COALESCE(b.CURR_BAL,0) * COALESCE(b.PD,0) * COALESCE(b.LGD,0)
                ELSE COALESCE(b.CURR_BAL,0) * COALESCE(b.PD,0) * COALESCE(b.LGD,0) * COALESCE(fx.EXCH_RATE,1)
            END
          , 2) AS EXPECTED_LOSS_RPT
        , COALESCE(c.CHARGE_AMT, 0)
        , COALESCE(c.CHARGE_AMT_RPT, 0)
        , b.MATURITY_DATE
        , CURRENT TIMESTAMP
    FROM SESSION.TMP_LOAN_BASE b
    LEFT JOIN SESSION.TMP_FX_RATE fx
           ON b.LOAN_CCY   = fx.FROM_CCY
          AND fx.TO_CCY    = l_reporting_ccy
          AND fx.RATE_DATE = l_report_date
    LEFT JOIN SESSION.TMP_GUARANTEE g
           ON b.DEAL_NUM     = g.DEAL_NUM
          AND b.DEAL_SUB_NUM = g.DEAL_SUB_NUM
    LEFT JOIN SESSION.TMP_CHARGE c
           ON b.DEAL_NUM     = c.DEAL_NUM
          AND b.DEAL_SUB_NUM = c.DEAL_SUB_NUM;

    GET DIAGNOSTICS l_row_cnt = ROW_COUNT;

    CALL TEMP.PR_PROCEDURE_LOG(
          'FORMAT'
        , 'TEMP.PR_EXTRACT_LOAN_RISK_DTL'
        , 'INFO'
        , 'Main report inserted rows=' || CHAR(l_row_cnt)
    );

    ----------------------------------------------------------------
    -- Post update: enrich sector / group mapping
    ----------------------------------------------------------------
    UPDATE RPT.RPT_LOAN_RISK_DTL r
       SET (CUSTOMER_GROUP, INDUSTRY_CODE) =
           (
               SELECT
                     COALESCE(c.CUSTOMER_GROUP, 'UNKNOWN')
                   , COALESCE(c.INDUSTRY_CODE, 'UNKNOWN')
               FROM INTERFACE.CUST_PROFILE c
               WHERE c.CUST_NUM = r.CUST_NUM
               FETCH FIRST 1 ROW ONLY
           )
     WHERE EXISTS
           (
               SELECT 1
               FROM INTERFACE.CUST_PROFILE c
               WHERE c.CUST_NUM = r.CUST_NUM
           )
       AND r.BATCH_ID = l_batch_id;

    ----------------------------------------------------------------
    -- Optional logic controlled by config
    ----------------------------------------------------------------
    IF l_ctrl_flag = 'Y' THEN

        UPDATE RPT.RPT_LOAN_RISK_DTL r
           SET HIGH_RISK_FLAG =
               CASE
                   WHEN COALESCE(r.PD,0) >= 0.200000
                     OR COALESCE(r.LGD,0) >= 0.700000
                     OR COALESCE(r.EXPECTED_LOSS_RPT,0) >= 1000000
                   THEN 'Y'
                   ELSE 'N'
               END
         WHERE r.BATCH_ID = l_batch_id;

        CALL TEMP.PR_PROCEDURE_LOG(
              'FORMAT'
            , 'TEMP.PR_EXTRACT_LOAN_RISK_DTL'
            , 'INFO'
            , 'High risk flag updated'
        );

    END IF;

    ----------------------------------------------------------------
    -- Final commit
    ----------------------------------------------------------------
    COMMIT;

    CALL TEMP.PR_PROCEDURE_LOG(
          'FORMAT'
        , 'TEMP.PR_EXTRACT_LOAN_RISK_DTL'
        , 'INFO'
        , 'Procedure completed successfully. Batch=' || l_batch_id
    );

END
@


  
