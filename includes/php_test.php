<?php

    /**
     * Addresse class
     * 
     * @author 
     * @since Fri Dec 12 2025
     */
    class Addresse implements DatabaseObject
    {

        /**
         * Instance variables
         */
        private $id;
        private $customer_id;
        private $address_type;
        private $street_address;
        private $city;
        private $state;
        private $postal_code;
        private $country;
        private $is_default;
        private $created_at;

        function __construct($id = null)
        {
            if ($id)
            {
                $this->id = $id;
                $this->load();
            }
        }

        function getId()
        {
            return $this->id;
        }

        function setId($id)
        {
            $this->id = $id;
        }

        function getCustomerId()
        {
            return $this->customer_id;
        }

        function setCustomerId($customer_id)
        {
            $this->customer_id = $customer_id;
        }

        function getAddressType()
        {
            return $this->address_type;
        }

        function setAddressType($address_type)
        {
            $this->address_type = $address_type;
        }

        function getStreetAddress()
        {
            return $this->street_address;
        }

        function setStreetAddress($street_address)
        {
            $this->street_address = $street_address;
        }

        function getCity()
        {
            return $this->city;
        }

        function setCity($city)
        {
            $this->city = $city;
        }

        function getState()
        {
            return $this->state;
        }

        function setState($state)
        {
            $this->state = $state;
        }

        function getPostalCode()
        {
            return $this->postal_code;
        }

        function setPostalCode($postal_code)
        {
            $this->postal_code = $postal_code;
        }

        function getCountry()
        {
            return $this->country;
        }

        function setCountry($country)
        {
            $this->country = $country;
        }

        function getIsDefault()
        {
            return $this->is_default;
        }

        function setIsDefault($is_default)
        {
            $this->is_default = $is_default;
        }

        function getCreatedAt()
        {
            return $this->created_at;
        }

        function setCreatedAt($created_at)
        {
            $this->created_at = $created_at;
        }

        /**
         * The function to save the data or update if already exists
         * 
         * @return boolean Returns the success status of the operation 
         */
        public function save()
        {
            if (!empty($this->id) && valid($this->id))
            {
                return $this->update();
            }
            return $this->insert();
        }

        /**
         * The function to insert a record
         * 
         * @return boolean Returns the success status of the operation 
         */
        public function insert()
        {
            $db = Rapidkart::getInstance()->getDB();
            $table = SystemTables::DB_TBL_ADDRESSES;

            $sql = <<<SQL
INSERT INTO `{$table}`
(
    customer_id,
    address_type,
    street_address,
    city,
    state,
    postal_code,
    country,
    is_default,
    created_at
)
VALUES(
    '::customer_id',
    '::address_type',
    '::street_address',
    '::city',
    '::state',
    '::postal_code',
    '::country',
    '::is_default',
    '::created_at'
)
SQL;

            $args = array(
                '::customer_id'    => $this->customer_id,
                '::address_type'   => $this->address_type,
                '::street_address' => $this->street_address,
                '::city'           => $this->city,
                '::state'          => $this->state,
                '::postal_code'    => $this->postal_code,
                '::country'        => $this->country,
                '::is_default'     => $this->is_default,
                '::created_at'     => $this->created_at
            );

            $res = $db->query($sql, $args);
            if (!$res)
            {
                return false;
            }
            $this->id = $db->lastInsertId();
            return true;
        }

        /**
         * The function to update the existing record
         * 
         * @return boolean Returns the success status of the operation 
         */
        public function update()
        {
            $db = Rapidkart::getInstance()->getDB();
            $table = SystemTables::DB_TBL_ADDRESSES;

            $sql = <<<SQL
UPDATE `{$table}`
SET
    customer_id    = '::customer_id',
    address_type   = '::address_type',
    street_address = '::street_address',
    city           = '::city',
    state          = '::state',
    postal_code    = '::postal_code',
    country        = '::country',
    is_default     = '::is_default',
    created_at     = '::created_at'
WHERE id = '::id'
SQL;

            $args = array(
                '::customer_id'    => $this->customer_id,
                '::address_type'   => $this->address_type,
                '::street_address' => $this->street_address,
                '::city'           => $this->city,
                '::state'          => $this->state,
                '::postal_code'    => $this->postal_code,
                '::country'        => $this->country,
                '::is_default'     => $this->is_default,
                '::created_at'     => $this->created_at
                '::id'             => $this->id
            );

            $res = $db->query($sql, $args);
            if (!$res)
            {
                return false;
            }
            return true;
        }

        /**
         * Check for existence of the record in the database
         * 
         * @param int $id
         * @return boolean
         */
        public static function isExistent($id)
        {
            $db = Rapidkart::getInstance()->getDB();
            $table = SystemTables::DB_TBL_ADDRESSES;

            $sql = <<<SQL
SELECT *
FROM `{$table}`
WHERE id = '::id'
SQL;

            $res = $db->query($sql, array('::id' => $id));
            if (!$res || $db->resultNumRows($res) < 1)
            {
                return FALSE;
            }
            return TRUE;
        }

        /**
         * Load the data from the database
         * 
         * @return boolean Status of the operation
         */
        public function load()
        {
            $db = Rapidkart::getInstance()->getDB();

            $sql = "SELECT * "
                . "FROM `" . SystemTables::DB_TBL_ADDRESSES . "` "
                . "WHERE id = '::id'";

            $res = $db->query($sql, array('::id' => $this->id));
            if (!$res || $db->resultNumRows($res) < 1)
            {
                return FALSE;
            }

            $row = $db->fetchObject($res);
            foreach ($row as $key => $value)
            {
                $this->$key = $value;
            }
            return TRUE;
        }

        /**
         * Delete the record permanently
         * 
         * @param int $id
         * @return boolean
         */
        public static function delete($id)
        {
            $db = Rapidkart::getInstance()->getDB();

            $sql = "DELETE "
                . "FROM `" . SystemTables::DB_TBL_ADDRESSES . "` "
                . "WHERE id = '::id'";

            $args = array(
                '::id' => $id
            );

            $res = $db->query($sql, $args);
            if (!$res)
            {
                return false;
            }
            return true;
        }

        /**
         * Checks for the mandatory data for insert and update operation
         * 
         * @return boolean Returns success status of the operation
         */
        public function hasMandatoryData()
        {
            return true;
        }

        /**
         * Parse the data from the mysql result object
         * 
         * @param object $obj
         */
        public function parse($obj)
        {
            if (is_object($obj))
            {
                foreach ($obj as $key => $value)
                {
                    $this->$key = $value;
                }
            }
        }

    }
