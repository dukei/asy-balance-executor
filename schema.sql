-- MySQL Workbench Forward Engineering

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='TRADITIONAL,ALLOW_INVALID_DATES';

-- -----------------------------------------------------
-- Schema mydb
-- -----------------------------------------------------
-- -----------------------------------------------------
-- Schema asybalance
-- -----------------------------------------------------

-- -----------------------------------------------------
-- Schema asybalance
-- -----------------------------------------------------
CREATE SCHEMA IF NOT EXISTS `asybalance` DEFAULT CHARACTER SET utf8mb4 ;
USE `asybalance` ;

-- -----------------------------------------------------
-- Table `asybalance`.`ab_providers`
-- -----------------------------------------------------
DROP TABLE IF EXISTS `asybalance`.`ab_providers` ;

CREATE TABLE IF NOT EXISTS `asybalance`.`ab_providers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `type` VARCHAR(255) CHARACTER SET 'latin1' NOT NULL,
  `data` MEDIUMBLOB NOT NULL,
  `version` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `type_UNIQUE` (`type` ASC))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `asybalance`.`ab_executions`
-- -----------------------------------------------------
DROP TABLE IF EXISTS `asybalance`.`ab_executions` ;

CREATE TABLE IF NOT EXISTS `asybalance`.`ab_executions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `status` ENUM('INPROGRESS', 'SUCCESS', 'ERROR') NOT NULL DEFAULT 'INPROGRESS',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `prefs` MEDIUMTEXT NULL,
  `result` MEDIUMTEXT NULL,
  `account_id` INT(11) NOT NULL,
  `code_image` MEDIUMBLOB NULL,
  `code_till` DATETIME NULL,
  `code_params` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_execution_account1_idx` (`account_id` ASC),
  CONSTRAINT `fk_execution_account1`
    FOREIGN KEY (`account_id`)
    REFERENCES `asybalance`.`ab_accounts` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `asybalance`.`ab_accounts`
-- -----------------------------------------------------
DROP TABLE IF EXISTS `asybalance`.`ab_accounts` ;

CREATE TABLE IF NOT EXISTS `asybalance`.`ab_accounts` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `provider_id` INT NOT NULL,
  `execution_id` BIGINT NULL,
  `user_id` VARCHAR(64) CHARACTER SET 'latin1' NULL,
  `name` VARCHAR(255) NULL,
  `last_status` ENUM('INPROGRESS', 'SUCCESS', 'ERROR') NULL,
  `last_result` MEDIUMTEXT NULL,
  `last_result_time` DATETIME NULL,
  `prefs` MEDIUMTEXT NULL,
  `saved_data` MEDIUMTEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `fk_account_provider_idx` (`provider_id` ASC),
  INDEX `fk_account_execution1_idx` (`execution_id` ASC),
  INDEX `user_id` (`user_id` ASC),
  CONSTRAINT `fk_account_provider`
    FOREIGN KEY (`provider_id`)
    REFERENCES `asybalance`.`ab_providers` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_account_execution1`
    FOREIGN KEY (`execution_id`)
    REFERENCES `asybalance`.`ab_executions` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;


-- -----------------------------------------------------
-- Table `asybalance`.`ab_execution_logs`
-- -----------------------------------------------------
DROP TABLE IF EXISTS `asybalance`.`ab_execution_logs` ;

CREATE TABLE IF NOT EXISTS `asybalance`.`ab_execution_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `content` MEDIUMTEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `execution_id` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `fk_execution_log_execution1_idx` (`execution_id` ASC),
  CONSTRAINT `fk_execution_log_execution1`
    FOREIGN KEY (`execution_id`)
    REFERENCES `asybalance`.`ab_executions` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;

USE `asybalance`;

DELIMITER $$

USE `asybalance`$$
DROP TRIGGER IF EXISTS `asybalance`.`ab_executions_AFTER_INSERT` $$
USE `asybalance`$$
CREATE DEFINER = CURRENT_USER TRIGGER `asybalance`.`ab_executions_AFTER_INSERT` AFTER INSERT ON `ab_executions` FOR EACH ROW
BEGIN
	UPDATE ab_accounts acc SET acc.last_status=NEW.status, acc.execution_id=NEW.id WHERE acc.id = NEW.account_id;
END$$


USE `asybalance`$$
DROP TRIGGER IF EXISTS `asybalance`.`ab_executions_AFTER_UPDATE` $$
USE `asybalance`$$
CREATE DEFINER = CURRENT_USER TRIGGER `asybalance`.`ab_executions_AFTER_UPDATE` AFTER UPDATE ON `ab_executions` FOR EACH ROW
BEGIN
	IF (OLD.status <> NEW.status AND NEW.status <> 'INPROGRESS') THEN
		UPDATE ab_accounts acc SET acc.last_status=NEW.status, acc.last_result=NEW.result, acc.last_result_time=NOW() WHERE acc.id=NEW.account_id AND acc.execution_id=NEW.id;
	END IF;
END$$


DELIMITER ;

SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;
