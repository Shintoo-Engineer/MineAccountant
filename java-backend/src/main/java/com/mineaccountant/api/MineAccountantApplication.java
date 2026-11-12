package com.mineaccountant.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.List;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@SpringBootApplication
public class MineAccountantApplication {
    public static void main(String[] args) {
        SpringApplication.run(MineAccountantApplication.class, args);
    }
}

record LedgerEntry(
    long id,
    String description,
    String category,
    LocalDate transactionDate,
    String type,
    BigDecimal amount
) {}

record CreateLedgerEntry(
    @NotBlank @jakarta.validation.constraints.Size(max = 80) String description,
    @NotBlank @jakarta.validation.constraints.Size(max = 40) String category,
    @jakarta.validation.constraints.NotNull LocalDate transactionDate,
    @Pattern(regexp = "income|expense") String type,
    @Positive @jakarta.validation.constraints.Digits(integer = 10, fraction = 2) BigDecimal amount
) {}

@RestController
@RequestMapping("/api/transactions")
class TransactionController {
    private final JdbcTemplate jdbc;

    TransactionController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    List<LedgerEntry> list() {
        return jdbc.query("""
            SELECT id, description, category, transaction_date, type, amount
            FROM transactions ORDER BY transaction_date DESC, id DESC
            """, (rs, row) -> new LedgerEntry(
                rs.getLong("id"),
                rs.getString("description"),
                rs.getString("category"),
                LocalDate.parse(rs.getString("transaction_date")),
                rs.getString("type"),
                rs.getBigDecimal("amount")
            ));
    }

    @PostMapping
    org.springframework.http.ResponseEntity<LedgerEntry> create(@Valid @RequestBody CreateLedgerEntry entry) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            var statement = connection.prepareStatement("""
                INSERT INTO transactions (description, category, transaction_date, type, amount)
                VALUES (?, ?, ?, ?, ?)
                """, Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, entry.description().trim());
            statement.setString(2, entry.category().trim());
            statement.setString(3, entry.transactionDate().toString());
            statement.setString(4, entry.type());
            statement.setBigDecimal(5, entry.amount());
            return statement;
        }, keys);
        Number id = keys.getKey();
        if (id == null) throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not save transaction");
        return org.springframework.http.ResponseEntity.status(HttpStatus.CREATED).body(
            new LedgerEntry(id.longValue(), entry.description().trim(), entry.category().trim(), entry.transactionDate(), entry.type(), entry.amount())
        );
    }

    @DeleteMapping("/{id}")
    org.springframework.http.ResponseEntity<Void> delete(@PathVariable long id) {
        if (id <= 0 || jdbc.update("DELETE FROM transactions WHERE id = ?", id) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Transaction not found");
        }
        return org.springframework.http.ResponseEntity.noContent().build();
    }
}
